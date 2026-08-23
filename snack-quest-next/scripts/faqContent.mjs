// The customer-facing FAQ copy, in one place so the seed script (fresh
// installs) and the refresh script (installs that are already live)
// can never drift apart and tell two different stories.
//
// These answers describe the current flow: the order is placed and
// paid for on the website, and WhatsApp is support (§ Website Becomes
// the Primary Commerce Channel). Anything here that mentions replying
// to a message to buy something is out of date by definition.

export const FAQS = [
  {
    question: 'What is Snack Quest?',
    answer:
      'A Kenya-based mystery snack box company. Every box is a hand-picked, personally tasted mix of imported snacks, ordered and paid for online, and delivered nationwide.',
  },
  {
    question: "Where do Snack Quest's snacks come from?",
    answer:
      'Snack Quest is about snacks from around the world, and our first stop is Asia: Japan, Korea, China, and Thailand. Most boxes are a curated mix across all four — the one exception is Starter Box, which is noodles only. More regions will join over time; the Asia boxes are staying either way.',
  },
  {
    question: 'Can I choose only Japanese or only Korean snacks?',
    answer:
      "Not today. Every box except Starter Box (which is noodles only) is a mystery mix across Japan, Korea, China, and Thailand — what's inside is part of the surprise, and there is no single-country box yet.",
  },
  {
    question: 'How do I order?',
    answer:
      'On this website. Pick a box, tap Buy now, tell us where to send it, and pay with M-Pesa. It takes about a minute and there is nothing to install.',
  },
  {
    question: 'Do I need an app or an account?',
    answer:
      'No. You need a phone number that can receive an M-Pesa prompt, and that is it. We do not ask you to sign up or set a password to buy a box.',
  },
  {
    question: 'How do I pay?',
    answer:
      'With M-Pesa, at the end of checkout. We send an STK push to the phone number you entered, and you approve it with your PIN. Nothing is charged before you approve that prompt, and the page confirms the payment by itself once it goes through.',
  },
  {
    question: 'The M-Pesa prompt did not arrive. What do I do?',
    answer:
      'Check that your phone has signal and that the number you entered is the M-Pesa number you meant to use. The prompt can take a few seconds. If it still does not show up, leave the page open and message us on WhatsApp — we can see your checkout and sort it out with you.',
  },
  {
    question: 'Where do you deliver?',
    answer:
      'Anywhere in Kenya. In Nairobi and the surrounding towns, it comes straight to your door — next day, or same day if you order before 1pm. Anywhere else, collect it from a Fargo Courier pickup point near you.',
  },
  {
    question: 'Is delivery included in the price?',
    answer:
      "Yes, always — whether it's door delivery or a pickup point, the fee is calculated and added to your total automatically at checkout, so you see the full amount before you pay anything.",
  },
  {
    question: 'How long does delivery take?',
    answer:
      'Usually 24 to 48 hours. We hand-pack your box within a day of payment, then it is down to your courier and how far it has to travel. Message us on WhatsApp any time for an update.',
  },
  {
    question: 'Can I still order on WhatsApp?',
    answer:
      'Ordering now happens on the website, so it is faster and you can see your exact total before paying. Our WhatsApp is still very much open — it is where we answer questions, chase deliveries, and fix problems.',
  },
  {
    question: 'How do I use a referral or discount code?',
    answer:
      "If you came here from a creator's link, the code is already applied — you will see the discount on your total at checkout. Otherwise there is a field at checkout where you can type it in.",
  },
  {
    question: 'Can I change or cancel my order?',
    answer:
      "Message us on WhatsApp as soon as you can, with your order reference from the confirmation page. If it has not been packed yet, we can usually change or cancel it.",
  },
  {
    question: 'What if something arrives damaged or wrong?',
    answer:
      'Message us with a photo and your order reference. We handle refunds and replacements directly — no ticket system, just a reply on the same thread.',
  },
  {
    question: 'How does the Creator Program work?',
    answer:
      'Sign up, get your own referral link, and share it. Anyone who buys through your link gets a discount applied automatically, and you earn commission credited to your creator balance, which you can withdraw to M-Pesa.',
  },
];
