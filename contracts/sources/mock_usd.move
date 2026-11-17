module aurum::mock_usd;

use sui::coin;

/// Simulated dollar asset. No monetary value and no physical backing.
public struct MOCK_USD has drop {}

fun init(witness: MOCK_USD, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        witness, 6, b"mUSD", b"MockUSD",
        b"Simulated dollars for a university project. No monetary value.",
        option::none(), ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(cap, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(MOCK_USD {}, ctx) }
