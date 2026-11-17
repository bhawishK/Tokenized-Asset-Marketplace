module aurum::marketplace;

use aurum::mock_usd::MOCK_USD;
use aurum::demo_gold::DEMO_GOLD;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;

const EQuantity: u64 = 0;
const EPayment: u64 = 1;
const EInventory: u64 = 2;
const EUnauthorized: u64 = 3;
const ECompleted: u64 = 4;
const ERecipient: u64 = 5;
const PRICE: u64 = 100;
const MAX_QUANTITY: u64 = 184467440737095516;

public struct Marketplace has key {
    id: UID,
    inventory: Balance<DEMO_GOLD>,
    price: u64,
    proceeds: address,
}

/// Owned by the issuer. Neither treasury is shared or returned by a public getter.
public struct IssuerCap has key {
    id: UID,
    marketplace: ID,
    usd: TreasuryCap<MOCK_USD>,
    gold: TreasuryCap<DEMO_GOLD>,
}

/// status 0 = surrendered in escrow; status 1 = burned, simulation complete.
public struct RedemptionRequest has key {
    id: UID,
    marketplace: ID,
    holder: address,
    quantity: u64,
    escrow: Balance<DEMO_GOLD>,
    status: u8,
}

public struct Purchase has copy, drop {
    marketplace: ID, buyer: address, quantity: u64, amount_paid: u64,
}
public struct RedemptionRequested has copy, drop {
    marketplace: ID, request: ID, holder: address, quantity: u64,
}
public struct RedemptionCompleted has copy, drop {
    marketplace: ID, request: ID, holder: address, quantity: u64,
}
public struct GoldTransferred has copy, drop { sender: address, recipient: address, quantity: u64 }

/// Both unique treasury capabilities must be owned by the signer to initialize.
/// Consuming them prevents a second marketplace for these assets.
public fun initialize(usd: TreasuryCap<MOCK_USD>, gold: TreasuryCap<DEMO_GOLD>, proceeds: address, ctx: &mut TxContext) {
    assert!(proceeds != @0x0, ERecipient);
    let market = Marketplace { id: object::new(ctx), inventory: balance::zero(), price: PRICE, proceeds };
    let cap = IssuerCap { id: object::new(ctx), marketplace: object::id(&market), usd, gold };
    transfer::transfer(cap, ctx.sender());
    transfer::share_object(market);
}

fun authorize(cap: &IssuerCap, market: ID) { assert!(cap.marketplace == market, EUnauthorized) }

public fun mint_inventory(cap: &mut IssuerCap, market: &mut Marketplace, quantity: u64, ctx: &mut TxContext) {
    authorize(cap, object::id(market));
    assert!(quantity > 0, EQuantity);
    balance::join(&mut market.inventory, coin::into_balance(coin::mint(&mut cap.gold, quantity, ctx)));
}

public fun fund_buyer(cap: &mut IssuerCap, amount: u64, buyer: address, ctx: &mut TxContext) {
    assert!(amount > 0, EQuantity);
    assert!(buyer != @0x0, ERecipient);
    transfer::public_transfer(coin::mint(&mut cap.usd, amount, ctx), buyer);
}

/// The buyer supplies only quantity and a real MockUSD coin, never price or recipient.
/// All mutations, delivery, proceeds, change and event commit in ONE transaction.
public fun purchase(market: &mut Marketplace, mut payment: Coin<MOCK_USD>, quantity: u64, ctx: &mut TxContext) {
    assert!(quantity > 0 && quantity <= MAX_QUANTITY, EQuantity);
    let cost = quantity * market.price;
    assert!(coin::value(&payment) >= cost, EPayment);
    assert!(balance::value(&market.inventory) >= quantity, EInventory);
    let proceeds = coin::split(&mut payment, cost, ctx);
    let gold = coin::take(&mut market.inventory, quantity, ctx);
    transfer::public_transfer(proceeds, market.proceeds);
    transfer::public_transfer(gold, ctx.sender());
    if (coin::value(&payment) == 0) { coin::destroy_zero(payment) }
    else { transfer::public_transfer(payment, ctx.sender()) };
    event::emit(Purchase { marketplace: object::id(market), buyer: ctx.sender(), quantity, amount_paid: cost });
}

public fun transfer_gold(gold: Coin<DEMO_GOLD>, recipient: address, ctx: &mut TxContext) {
    assert!(recipient != @0x0, ERecipient);
    let quantity = coin::value(&gold);
    assert!(quantity > 0, EQuantity);
    transfer::public_transfer(gold, recipient);
    event::emit(GoldTransferred { sender: ctx.sender(), recipient, quantity });
}

public fun request_redemption(market: &Marketplace, gold: Coin<DEMO_GOLD>, ctx: &mut TxContext) {
    let quantity = coin::value(&gold);
    assert!(quantity > 0, EQuantity);
    let request = RedemptionRequest {
        id: object::new(ctx), marketplace: object::id(market), holder: ctx.sender(),
        quantity, escrow: coin::into_balance(gold), status: 0,
    };
    event::emit(RedemptionRequested { marketplace: request.marketplace, request: object::id(&request), holder: request.holder, quantity });
    transfer::share_object(request);
}

public fun complete_redemption(cap: &mut IssuerCap, request: &mut RedemptionRequest, ctx: &mut TxContext) {
    authorize(cap, request.marketplace);
    assert!(request.status == 0, ECompleted);
    let gold = coin::take(&mut request.escrow, request.quantity, ctx);
    coin::burn(&mut cap.gold, gold);
    request.status = 1;
    event::emit(RedemptionCompleted { marketplace: request.marketplace, request: object::id(request), holder: request.holder, quantity: request.quantity });
}

public fun inventory(market: &Marketplace): u64 { balance::value(&market.inventory) }
public fun price(market: &Marketplace): u64 { market.price }
public fun status(request: &RedemptionRequest): u8 { request.status }
public fun escrowed(request: &RedemptionRequest): u64 { balance::value(&request.escrow) }

#[test_only]
public fun gold_supply_for_testing(cap: &IssuerCap): u64 { coin::total_supply(&cap.gold) }

#[test_only]
public fun setup_for_testing(ctx: &mut TxContext) {
    aurum::mock_usd::init_for_testing(ctx);
    aurum::demo_gold::init_for_testing(ctx);
}

#[test_only]
public fun corrupt_market_for_testing(cap: &mut IssuerCap) {
    cap.marketplace = object::id_from_address(@0x99);
}
