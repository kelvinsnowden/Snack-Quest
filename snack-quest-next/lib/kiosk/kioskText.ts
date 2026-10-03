import type { Allergen } from '@/lib/products/productDetails';
import type { KioskLocale } from '@/types/kioskExperience';

/**
 * Every fixed word a customer reads on the machine screen, per language
 * (§ KIOSK LANGUAGES). Staff-written wording (banner, idle screen, badges,
 * message strips) is not here: it lives in the screen design and its
 * translations (`localizeExperience`).
 *
 * Placeholders are `{name}`. The Swahili was written for this screen and
 * should be read by a native speaker before machines go live with it —
 * the allergen names above all.
 */
const EN = {
  offlineLastMenu: 'Offline — showing the last menu',
  machineCode: 'Machine {code}',
  searchSnacks: 'Search snacks',
  resultsFor: 'Results for “{term}”',
  allSnacks: 'All snacks',
  allCategories: 'All',
  categories: 'Categories',
  snackCount_one: '{n} snack',
  snackCount_other: '{n} snacks',
  noMatchTitle: 'No snacks match that.',
  noMatchBody: 'Try another word, or look through every snack.',
  showAllSnacks: 'Show all snacks',
  menuUnavailableTitle: 'The menu isn’t available right now.',
  menuUnavailableBody: 'This machine can’t reach Snack Quest. It will try again on its own.',
  loadingMenu: 'Loading the menu',
  emptyOrder: 'Tap {plus} on a snack to start your order.',
  plusButton: 'the plus button',
  yourOrder: 'Your order',
  removeOne: 'Remove one {name}',
  addOneMore: 'Add one more {name}',
  removeLine: 'Remove {name} from cart',
  clear: 'Clear',
  clearOrderWord: 'order',
  itemCount_one: '{n} item',
  itemCount_other: '{n} items',
  pay: 'Pay',
  withMpesa: 'with M-Pesa',
  close: 'Close',
  fromOrigin: 'From {origin}',
  howMany: 'How many?',
  alreadyInOrder: '{n} already in your order',
  addToOrder: 'Add to order · {price}',
  unavailableTryAnother: '{state} — try another snack.',
  youMightAlsoLike: 'You might also like',
  backToMenu: 'Back to menu',
  total: 'Total',
  payWithMpesa: 'Pay with M-Pesa',
  enterPhone: 'Enter the phone number that should get the payment request.',
  mpesaNumber: 'M-Pesa number',
  sendPaymentRequest: 'Send payment request',
  onePrompt: 'One M-Pesa prompt covers your whole order. Nothing is charged until you enter your PIN on your phone.',
  previewNoPayments: 'This is a preview — payments are switched off.',
  couldNotStartPayment: 'Could not start payment. Some items may no longer be available — go back to the menu to check your order.',
  couldNotReach: 'Could not reach Snack Quest. Check the connection and try again — nothing has been charged.',
  takingLonger: 'This is taking longer than expected. Please contact support if you were charged.',
  stepRequestSent: 'Request sent',
  stepEnterPin: 'Enter your PIN',
  stepCollect: 'Collect your snacks',
  stepNow: ' (now)',
  paymentReceived: 'Payment received',
  checkYourPhone: 'Check your phone',
  onTheirWay: 'Your snacks are on their way down — collect them from the tray below.',
  enterPinPrompt: 'Enter your M-Pesa PIN on {phone} to pay {amount} for your whole order.',
  orderProgress: 'Order progress',
  dispensed: 'Dispensed',
  problem: 'Problem',
  waiting: 'Waiting',
  lineDone: ' ({done}/{total} done)',
  itemsDone: '{done} of {total} items done',
  resultPaymentFailed: 'Payment was not completed',
  resultTryAgain: 'Please try again.',
  resultRefundedTitle: 'Your payment was refunded',
  resultRefundedBody: 'Nothing from this order was dispensed.',
  resultAllDone: 'All done — enjoy your snacks!',
  resultEnjoyOne: 'Enjoy your snack!',
  resultCollectThem: 'Collect them from the tray below.',
  resultCollectIt: 'Collect it from the tray below.',
  resultPartialTitle: '{dispensed} of {total} items dispensed',
  resultPartialBody: '{failed} had an issue. If you were charged for those, support will follow up.',
  resultChecking: 'We’re checking on your order',
  resultChargedFollowUp: 'If you were charged, support will follow up.',
  resultCouldNotDispense: 'We couldn’t dispense your order',
  resultContactRefund: 'Please contact support for a refund.',
  stateSoldOut: 'Sold out',
  stateUnavailable: 'Unavailable',
  stateComingSoon: 'Coming soon',
  addToOrderAria: 'Add {name} to cart',
  chooseHowManyAria: 'Choose how many {name} to add',
  inYourOrder: ' in your order',
  promotions: 'Promotions',
  showPromotion: 'Show promotion {i} of {n}',
  welcome: 'Welcome',
  snacksFrom: 'Snacks from {places}.',
  snacksFromAndMore: 'Snacks from {places} and more.',
  snacksFromWorld: 'Snacks from around the world.',
  payWithMpesaShort: 'Pay with M-Pesa.',
  tapToStartOrder: 'Tap to start your order',
  ctaTapToStartOrder: '{cta} — tap to start your order',
  adLabel: 'Ad',
  tapToStart: 'Tap to start',
  contains: 'Contains {list}.',
  noDeclaredAllergens: 'No declared allergens.',
  language: 'Language',
} as const;

export type KioskTextKey = keyof typeof EN;

const SW: Record<KioskTextKey, string> = {
  offlineLastMenu: 'Nje ya mtandao — inaonyesha menyu ya mwisho',
  machineCode: 'Mashine {code}',
  searchSnacks: 'Tafuta vitafunio',
  resultsFor: 'Matokeo ya “{term}”',
  allSnacks: 'Vitafunio vyote',
  allCategories: 'Vyote',
  categories: 'Aina',
  snackCount_one: 'Kitafunio {n}',
  snackCount_other: 'Vitafunio {n}',
  noMatchTitle: 'Hakuna kitafunio kinacholingana na hilo.',
  noMatchBody: 'Jaribu neno lingine, au angalia vitafunio vyote.',
  showAllSnacks: 'Onyesha vitafunio vyote',
  menuUnavailableTitle: 'Menyu haipatikani kwa sasa.',
  menuUnavailableBody: 'Mashine hii haiwezi kufikia Snack Quest. Itajaribu tena yenyewe.',
  loadingMenu: 'Inapakia menyu',
  emptyOrder: 'Gusa {plus} kwenye kitafunio ili kuanza oda yako.',
  plusButton: 'kitufe cha kuongeza',
  yourOrder: 'Oda yako',
  removeOne: 'Ondoa {name} moja',
  addOneMore: 'Ongeza {name} moja zaidi',
  removeLine: 'Ondoa {name} kwenye oda yako',
  clear: 'Futa',
  clearOrderWord: 'oda',
  itemCount_one: 'Kitu {n}',
  itemCount_other: 'Vitu {n}',
  pay: 'Lipa',
  withMpesa: 'kwa M-Pesa',
  close: 'Funga',
  fromOrigin: 'Kutoka {origin}',
  howMany: 'Ngapi?',
  alreadyInOrder: '{n} tayari kwenye oda yako',
  addToOrder: 'Ongeza kwenye oda · {price}',
  unavailableTryAnother: '{state} — jaribu kitafunio kingine.',
  youMightAlsoLike: 'Huenda ukapenda pia',
  backToMenu: 'Rudi kwenye menyu',
  total: 'Jumla',
  payWithMpesa: 'Lipa kwa M-Pesa',
  enterPhone: 'Weka nambari ya simu itakayopokea ombi la malipo.',
  mpesaNumber: 'Nambari ya M-Pesa',
  sendPaymentRequest: 'Tuma ombi la malipo',
  onePrompt: 'Ombi moja la M-Pesa linalipia oda yako yote. Hakuna pesa itakayokatwa hadi uweke PIN yako kwenye simu.',
  previewNoPayments: 'Huu ni muonekano wa majaribio — malipo yamezimwa.',
  couldNotStartPayment: 'Malipo hayakuweza kuanza. Baadhi ya bidhaa huenda hazipatikani tena — rudi kwenye menyu uangalie oda yako.',
  couldNotReach: 'Haikuweza kufikia Snack Quest. Angalia muunganisho kisha ujaribu tena — hakuna pesa iliyokatwa.',
  takingLonger: 'Hii inachukua muda kuliko kawaida. Tafadhali wasiliana na huduma kwa wateja kama umekatwa pesa.',
  stepRequestSent: 'Ombi limetumwa',
  stepEnterPin: 'Weka PIN yako',
  stepCollect: 'Chukua vitafunio vyako',
  stepNow: ' (sasa)',
  paymentReceived: 'Malipo yamepokelewa',
  checkYourPhone: 'Angalia simu yako',
  onTheirWay: 'Vitafunio vyako vinashuka — vichukue kwenye trei iliyo chini.',
  enterPinPrompt: 'Weka PIN yako ya M-Pesa kwenye {phone} ili ulipe {amount} kwa oda yako yote.',
  orderProgress: 'Hatua za oda',
  dispensed: 'Imetolewa',
  problem: 'Tatizo',
  waiting: 'Inasubiri',
  lineDone: ' ({done}/{total} tayari)',
  itemsDone: '{done} kati ya {total} tayari',
  resultPaymentFailed: 'Malipo hayakukamilika',
  resultTryAgain: 'Tafadhali jaribu tena.',
  resultRefundedTitle: 'Pesa yako imerudishwa',
  resultRefundedBody: 'Hakuna kilichotolewa katika oda hii.',
  resultAllDone: 'Tayari — furahia vitafunio vyako!',
  resultEnjoyOne: 'Furahia kitafunio chako!',
  resultCollectThem: 'Vichukue kwenye trei iliyo chini.',
  resultCollectIt: 'Kichukue kwenye trei iliyo chini.',
  resultPartialTitle: '{dispensed} kati ya {total} vimetolewa',
  resultPartialBody: '{failed} vilikuwa na tatizo. Kama ulikatwa pesa kwa hivyo, huduma kwa wateja watafuatilia.',
  resultChecking: 'Tunafuatilia oda yako',
  resultChargedFollowUp: 'Kama ulikatwa pesa, huduma kwa wateja watafuatilia.',
  resultCouldNotDispense: 'Hatukuweza kutoa oda yako',
  resultContactRefund: 'Tafadhali wasiliana na huduma kwa wateja urudishiwe pesa.',
  stateSoldOut: 'Imeisha',
  stateUnavailable: 'Haipatikani',
  stateComingSoon: 'Inakuja hivi karibuni',
  addToOrderAria: 'Ongeza {name} kwenye oda yako',
  chooseHowManyAria: 'Chagua idadi ya {name} ya kuongeza',
  inYourOrder: ' kwenye oda yako',
  promotions: 'Matangazo',
  showPromotion: 'Onyesha tangazo {i} kati ya {n}',
  welcome: 'Karibu',
  snacksFrom: 'Vitafunio kutoka {places}.',
  snacksFromAndMore: 'Vitafunio kutoka {places} na kwingineko.',
  snacksFromWorld: 'Vitafunio kutoka kote duniani.',
  payWithMpesaShort: 'Lipa kwa M-Pesa.',
  tapToStartOrder: 'Gusa ili kuanza oda yako',
  ctaTapToStartOrder: '{cta} — gusa ili kuanza oda yako',
  adLabel: 'Tangazo',
  tapToStart: 'Gusa ili kuanza',
  contains: 'Ina {list}.',
  noDeclaredAllergens: 'Hakuna vizio vilivyotajwa.',
  language: 'Lugha',
};

const DICTIONARIES: Record<KioskLocale, Record<KioskTextKey, string>> = { en: EN, sw: SW };

const ALLERGEN_WORDS: Record<KioskLocale, Record<Allergen, string>> = {
  en: { gluten: 'gluten', crustaceans: 'crustaceans', eggs: 'eggs', fish: 'fish', peanuts: 'peanuts', soy: 'soy', milk: 'milk', tree_nuts: 'tree nuts', celery: 'celery', mustard: 'mustard', sesame: 'sesame', sulphites: 'sulphites', lupin: 'lupin', molluscs: 'molluscs' },
  sw: { gluten: 'gluteni', crustaceans: 'krasteshia (kamba, kaa)', eggs: 'mayai', fish: 'samaki', peanuts: 'karanga', soy: 'soya', milk: 'maziwa', tree_nuts: 'njugu za miti', celery: 'seleri', mustard: 'haradali', sesame: 'ufuta', sulphites: 'salfaiti', lupin: 'lupini', molluscs: 'moluska' },
};

function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export type KioskTextPart = { text: string } | { slot: string };

export interface KioskText {
  locale: KioskLocale;
  t(key: KioskTextKey, vars?: Record<string, string | number>): string;
  /** `{n}`-counted text: picks `<key>_one` or `<key>_other`. */
  count(key: 'snackCount' | 'itemCount', n: number): string;
  /** The template split around `{name}` slots, for slots that are markup (bold numbers). */
  parts(key: KioskTextKey): KioskTextPart[];
  allergens(list: readonly Allergen[] | null | undefined): string | null;
}

export function kioskText(locale: KioskLocale): KioskText {
  const dictionary = DICTIONARIES[locale] ?? EN;
  return {
    locale,
    t: (key, vars) => fill(dictionary[key] ?? EN[key], vars),
    count: (key, n) => fill(dictionary[`${key}_${n === 1 ? 'one' : 'other'}`], { n }),
    parts: (key) =>
      (dictionary[key] ?? EN[key])
        .split(/(\{\w+\})/)
        .filter(Boolean)
        .map((piece): KioskTextPart => (/^\{\w+\}$/.test(piece) ? { slot: piece.slice(1, -1) } : { text: piece })),
    allergens: (list) => {
      if (list === undefined || list === null) return null;
      if (list.length === 0) return dictionary.noDeclaredAllergens;
      return fill(dictionary.contains, { list: list.map((key) => ALLERGEN_WORDS[locale][key]).join(', ') });
    },
  };
}

/** The dictionaries, for the test that keeps them in step. */
export const KIOSK_DICTIONARIES = DICTIONARIES;
