#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub id: u64,
    pub student: Address,
    pub merchant: Address,
    pub amount: i128,
    pub allowance_after: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Merchant(Address),
    Allowance(Address),
    StudentSpent(Address),
    MerchantTotal(Address),
    Receipt(u64),
    ReceiptCount,
}

#[contract]
pub struct MealPassPh;

#[contractimpl]
impl MealPassPh {
    /// Sets the school admin and USDC token contract once.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::ReceiptCount, &0u64);
    }

    /// Lets the school approve or remove a canteen that can receive meal funds.
    pub fn set_merchant(env: Env, admin: Address, merchant: Address, approved: bool) {
        require_admin(&env, &admin);
        env.storage()
            .persistent()
            .set(&DataKey::Merchant(merchant), &approved);
    }

    /// Moves USDC from the school into this contract and credits a student allowance.
    pub fn fund_student(env: Env, admin: Address, student: Address, amount: i128) {
        require_admin(&env, &admin);
        require_positive(amount);

        let token_id = token_id(&env);
        token::TokenClient::new(&env, &token_id).transfer(
            &admin,
            &env.current_contract_address(),
            &amount,
        );

        let key = DataKey::Allowance(student);
        let current = read_i128(&env, &key);
        env.storage().persistent().set(&key, &(current + amount));
    }

    /// Student scans an approved canteen QR; the contract pays the canteen and records a receipt.
    pub fn pay_meal(env: Env, student: Address, merchant: Address, amount: i128) -> u64 {
        student.require_auth();
        require_positive(amount);

        if !is_merchant_approved(&env, merchant.clone()) {
            panic!("merchant not approved");
        }

        let allowance_key = DataKey::Allowance(student.clone());
        let allowance = read_i128(&env, &allowance_key);
        if allowance < amount {
            panic!("insufficient allowance");
        }
        let remaining = allowance - amount;
        env.storage().persistent().set(&allowance_key, &remaining);

        let spent_key = DataKey::StudentSpent(student.clone());
        let spent = read_i128(&env, &spent_key) + amount;
        env.storage().persistent().set(&spent_key, &spent);

        let merchant_key = DataKey::MerchantTotal(merchant.clone());
        let merchant_total = read_i128(&env, &merchant_key) + amount;
        env.storage().persistent().set(&merchant_key, &merchant_total);

        let receipt_id = Self::receipt_count(env.clone()) + 1;
        env.storage()
            .instance()
            .set(&DataKey::ReceiptCount, &receipt_id);
        env.storage().persistent().set(
            &DataKey::Receipt(receipt_id),
            &Receipt {
                id: receipt_id,
                student,
                merchant: merchant.clone(),
                amount,
                allowance_after: remaining,
                timestamp: env.ledger().timestamp(),
            },
        );

        let token_id = token_id(&env);
        token::TokenClient::new(&env, &token_id).transfer(
            &env.current_contract_address(),
            &merchant,
            &amount,
        );

        receipt_id
    }

    /// Returns the USDC token contract used for settlement.
    pub fn token(env: Env) -> Address {
        token_id(&env)
    }

    /// Returns whether a canteen is approved by the school.
    pub fn is_merchant(env: Env, merchant: Address) -> bool {
        is_merchant_approved(&env, merchant)
    }

    /// Returns how much meal allowance a student can still spend.
    pub fn allowance(env: Env, student: Address) -> i128 {
        read_i128(&env, &DataKey::Allowance(student))
    }

    /// Returns the total amount a student has spent through MealPass.
    pub fn student_spent(env: Env, student: Address) -> i128 {
        read_i128(&env, &DataKey::StudentSpent(student))
    }

    /// Returns the total USDC received by one approved canteen.
    pub fn merchant_total(env: Env, merchant: Address) -> i128 {
        read_i128(&env, &DataKey::MerchantTotal(merchant))
    }

    /// Returns a stored meal receipt by id.
    pub fn receipt(env: Env, id: u64) -> Receipt {
        env.storage()
            .persistent()
            .get(&DataKey::Receipt(id))
            .expect("receipt not found")
    }

    /// Returns the latest receipt id.
    pub fn receipt_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ReceiptCount)
            .unwrap_or(0)
    }
}

fn require_admin(env: &Env, admin: &Address) {
    admin.require_auth();
    let stored: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("not initialized");
    if &stored != admin {
        panic!("not admin");
    }
}

fn token_id(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Token)
        .expect("not initialized")
}

fn read_i128(env: &Env, key: &DataKey) -> i128 {
    env.storage().persistent().get(key).unwrap_or(0)
}

fn is_merchant_approved(env: &Env, merchant: Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Merchant(merchant))
        .unwrap_or(false)
}

fn require_positive(amount: i128) {
    if amount <= 0 {
        panic!("amount must be positive");
    }
}

mod test;
