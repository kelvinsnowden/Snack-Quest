import { getDb, saveDb, getNowIso } from '../../api/repositories/dbRepository';

export class CustomerService {
  static getCustomerProfile(customerId: string) {
    const db = getDb();
    const customer = db.customers?.find((c) => c.id === customerId || c.email === customerId || c.phone === customerId);
    if (!customer) return null;

    const orders = db.orders?.filter((o) => o.customer_id === customer.id) || [];
    const walletTransactions = db.wallet_transactions?.filter((w) => w.customer_id === customer.id) || [];
    const rewardSubmissions = db.reward_submissions?.filter((r) => r.customer_id === customer.id) || [];
    const referrals = db.referrals?.filter((ref) => ref.referrer_customer_id === customer.id) || [];

    const walletBalanceCents = walletTransactions.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      profile: customer,
      address_book: [
        {
          id: 'addr-primary',
          county: customer.county || 'Nairobi',
          town: customer.town || 'Nairobi CBD',
          delivery_address: customer.delivery_address || 'Default Delivery Address',
          is_default: true,
        },
      ],
      wallet: {
        balance_points: Math.max(0, Math.floor(walletBalanceCents / 100)),
        balance_kes: Math.max(0, walletBalanceCents / 100),
        transactions: walletTransactions,
      },
      quest_history: rewardSubmissions,
      referrals: {
        referral_code: customer.referral_code || 'WANJ123',
        referral_link: `https://snackquests.shop/join?ref=${customer.referral_code || 'WANJ123'}`,
        invited_count: referrals.length,
        qualified_count: referrals.filter((r) => r.status === 'qualified').length,
      },
      order_history: orders,
    };
  }

  static updateCustomerProfile(customerId: string, data: any) {
    const db = getDb();
    const customer = db.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    if (data.full_name) customer.full_name = data.full_name;
    if (data.email) customer.email = data.email;
    if (data.phone) customer.phone = data.phone;
    if (data.county) customer.county = data.county;
    if (data.town) customer.town = data.town;
    if (data.delivery_address) customer.delivery_address = data.delivery_address;
    customer.updated_at = getNowIso();

    saveDb();
    return customer;
  }
}
