#[test_only]
module aurum::marketplace_tests;

use aurum::marketplace::{Self, Marketplace, IssuerCap, RedemptionRequest};
use aurum::mock_usd::MOCK_USD;
use aurum::demo_gold::DEMO_GOLD;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::test_scenario::{Self as ts, Scenario};

const ISSUER: address = @0xA;
const BUYER: address = @0xB;
const SELLER: address = @0xC;

fun setup(): Scenario {
    let mut s = ts::begin(ISSUER);
    marketplace::setup_for_testing(ts::ctx(&mut s));
    ts::next_tx(&mut s, ISSUER);
    let usd = ts::take_from_sender<TreasuryCap<MOCK_USD>>(&s);
    let gold = ts::take_from_sender<TreasuryCap<DEMO_GOLD>>(&s);
    marketplace::initialize(usd, gold, SELLER, ts::ctx(&mut s));
    ts::next_tx(&mut s, ISSUER);
    let mut cap = ts::take_from_sender<IssuerCap>(&s);
    let mut market = ts::take_shared<Marketplace>(&s);
    marketplace::mint_inventory(&mut cap, &mut market, 10_000_000, ts::ctx(&mut s));
    marketplace::fund_buyer(&mut cap, 250_000_000, BUYER, ts::ctx(&mut s));
    ts::return_to_sender(&s, cap);
    ts::return_shared(market);
    ts::next_tx(&mut s, BUYER);
    s
}

#[test]
fun purchase_settles_both_assets_and_returns_change() {
    let mut s = setup();
    let mut market = ts::take_shared<Marketplace>(&s);
    let payment = ts::take_from_sender<Coin<MOCK_USD>>(&s);
    assert!(coin::value(&payment) == 250_000_000);
    assert!(marketplace::inventory(&market) == 10_000_000);
    marketplace::purchase(&mut market, payment, 1_000_000, ts::ctx(&mut s));
    assert!(marketplace::inventory(&market) == 9_000_000);
    ts::return_shared(market);
    ts::next_tx(&mut s, BUYER);
    let change = ts::take_from_sender<Coin<MOCK_USD>>(&s);
    let gold = ts::take_from_sender<Coin<DEMO_GOLD>>(&s);
    assert!(coin::value(&change) == 150_000_000);
    assert!(coin::value(&gold) == 1_000_000);
    ts::return_to_sender(&s, change);
    ts::return_to_sender(&s, gold);
    ts::next_tx(&mut s, SELLER);
    let proceeds = ts::take_from_sender<Coin<MOCK_USD>>(&s);
    assert!(coin::value(&proceeds) == 100_000_000);
    assert!(!ts::has_most_recent_for_sender<Coin<DEMO_GOLD>>(&s));
    ts::return_to_sender(&s, proceeds);
    ts::end(s);
}

#[test, expected_failure(abort_code = 1, location = aurum::marketplace)]
fun insufficient_payment() {
    let mut s = setup();
    let mut market = ts::take_shared<Marketplace>(&s);
    let payment = ts::take_from_sender<Coin<MOCK_USD>>(&s);
    marketplace::purchase(&mut market, payment, 3_000_000, ts::ctx(&mut s));
    ts::return_shared(market);
    ts::end(s);
}

#[test, expected_failure(abort_code = 2, location = aurum::marketplace)]
fun insufficient_inventory() {
    let mut s = setup();
    // Obtain sufficient payment so this specifically reaches inventory validation.
    ts::next_tx(&mut s, ISSUER);
    let mut cap = ts::take_from_sender<IssuerCap>(&s);
    marketplace::fund_buyer(&mut cap, 2_000_000_000, @0xD, ts::ctx(&mut s));
    ts::return_to_sender(&s, cap);
    ts::next_tx(&mut s, @0xD);
    let mut market = ts::take_shared<Marketplace>(&s);
    let payment = ts::take_from_sender<Coin<MOCK_USD>>(&s);
    marketplace::purchase(&mut market, payment, 11_000_000, ts::ctx(&mut s));
    ts::return_shared(market);
    ts::end(s);
}

#[test, expected_failure(abort_code = 3, location = aurum::marketplace)]
fun capability_for_another_market_is_rejected() {
    let mut s = setup();
    ts::next_tx(&mut s, ISSUER);
    let mut cap = ts::take_from_sender<IssuerCap>(&s);
    let mut market = ts::take_shared<Marketplace>(&s);
    marketplace::corrupt_market_for_testing(&mut cap);
    marketplace::mint_inventory(&mut cap, &mut market, 1, ts::ctx(&mut s));
    ts::return_to_sender(&s, cap);
    ts::return_shared(market);
    ts::end(s);
}

#[test, expected_failure(abort_code = 3, location = sui::test_scenario)]
fun buyer_cannot_obtain_issuer_capability() {
    let s = setup();
    let cap = ts::take_from_sender<IssuerCap>(&s);
    ts::return_to_sender(&s, cap);
    ts::end(s);
}

#[test]
fun redemption_escrows_then_burns() {
    let mut s = setup();
    let mut market = ts::take_shared<Marketplace>(&s);
    let payment = ts::take_from_sender<Coin<MOCK_USD>>(&s);
    marketplace::purchase(&mut market, payment, 1_000_000, ts::ctx(&mut s));
    ts::return_shared(market);
    ts::next_tx(&mut s, BUYER);
    let market = ts::take_shared<Marketplace>(&s);
    let gold = ts::take_from_sender<Coin<DEMO_GOLD>>(&s);
    marketplace::request_redemption(&market, gold, ts::ctx(&mut s));
    ts::return_shared(market);
    ts::next_tx(&mut s, BUYER);
    assert!(!ts::has_most_recent_for_sender<Coin<DEMO_GOLD>>(&s));
    let request = ts::take_shared<RedemptionRequest>(&s);
    assert!(marketplace::status(&request) == 0);
    assert!(marketplace::escrowed(&request) == 1_000_000);
    ts::return_shared(request);
    ts::next_tx(&mut s, ISSUER);
    let mut cap = ts::take_from_sender<IssuerCap>(&s);
    let mut request = ts::take_shared<RedemptionRequest>(&s);
    assert!(marketplace::gold_supply_for_testing(&cap) == 10_000_000);
    marketplace::complete_redemption(&mut cap, &mut request, ts::ctx(&mut s));
    assert!(marketplace::status(&request) == 1);
    assert!(marketplace::escrowed(&request) == 0);
    assert!(marketplace::gold_supply_for_testing(&cap) == 9_000_000);
    ts::return_to_sender(&s, cap);
    ts::return_shared(request);
    ts::end(s);
}

#[test, expected_failure(abort_code = 0, location = aurum::marketplace)]
fun zero_quantity_rejected() {
    let mut s = setup();
    let mut market = ts::take_shared<Marketplace>(&s);
    let payment = ts::take_from_sender<Coin<MOCK_USD>>(&s);
    marketplace::purchase(&mut market, payment, 0, ts::ctx(&mut s));
    ts::return_shared(market);
    ts::end(s);
}
