#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

fn setup() -> (
    Env,
    MealPassPhClient<'static>,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let school = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(school.clone());
    let token = asset.address();
    let student = Address::generate(&env);
    let merchant = Address::generate(&env);

    let contract_id = env.register(MealPassPh, ());
    let client = MealPassPhClient::new(&env, &contract_id);
    client.initialize(&school, &token);

    StellarAssetClient::new(&env, &token).mint(&school, &1_000_000_000i128);

    (env, client, token, contract_id, school, student, merchant)
}

#[test]
fn happy_path_funds_and_pays_canteen() {
    let (env, client, token, contract_id, school, student, merchant) = setup();
    let token_client = TokenClient::new(&env, &token);

    client.set_merchant(&school, &merchant, &true);
    client.fund_student(&school, &student, &100_000_000i128);
    let receipt_id = client.pay_meal(&student, &merchant, &35_000_000i128);

    assert_eq!(receipt_id, 1);
    assert_eq!(client.allowance(&student), 65_000_000);
    assert_eq!(token_client.balance(&merchant), 35_000_000);
    assert_eq!(token_client.balance(&contract_id), 65_000_000);
}

#[test]
#[should_panic(expected = "merchant not approved")]
fn edge_rejects_unapproved_merchant() {
    let (_, client, _, _, school, student, merchant) = setup();

    client.fund_student(&school, &student, &50_000_000i128);
    client.pay_meal(&student, &merchant, &10_000_000i128);
}

#[test]
fn state_verification_tracks_receipt_and_totals() {
    let (_, client, _, _, school, student, merchant) = setup();

    client.set_merchant(&school, &merchant, &true);
    client.fund_student(&school, &student, &120_000_000i128);
    client.pay_meal(&student, &merchant, &70_000_000i128);

    let receipt = client.receipt(&1);
    assert_eq!(receipt.student, student.clone());
    assert_eq!(receipt.merchant, merchant.clone());
    assert_eq!(receipt.amount, 70_000_000);
    assert_eq!(receipt.allowance_after, 50_000_000);
    assert_eq!(client.student_spent(&student), 70_000_000);
    assert_eq!(client.merchant_total(&merchant), 70_000_000);
    assert_eq!(client.receipt_count(), 1);
}

#[test]
#[should_panic(expected = "insufficient allowance")]
fn rejects_meal_above_student_allowance() {
    let (_, client, _, _, school, student, merchant) = setup();

    client.set_merchant(&school, &merchant, &true);
    client.fund_student(&school, &student, &10_000_000i128);
    client.pay_meal(&student, &merchant, &20_000_000i128);
}

#[test]
fn admin_can_disable_merchant() {
    let (_, client, _, _, school, _, merchant) = setup();

    client.set_merchant(&school, &merchant, &true);
    assert!(client.is_merchant(&merchant));

    client.set_merchant(&school, &merchant, &false);
    assert!(!client.is_merchant(&merchant));
}
