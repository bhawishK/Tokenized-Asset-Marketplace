module aurum::demo_gold;

use sui::coin;

/// Simulated gold units, not grams of physical gold. No backing or value.
public struct DEMO_GOLD has drop {}

fun init(witness: DEMO_GOLD, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        witness, 6, b"dGOLD", b"DemoGold",
        b"Simulated gold with no physical backing, redemption rights, or monetary value.",
        option::none(), ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(cap, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(DEMO_GOLD {}, ctx) }
