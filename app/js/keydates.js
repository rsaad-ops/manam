// Key dates: holidays, awareness days, industry events, trade shows and publications,
// each with a proposed key message and visual. Categories can be switched on and off.
//
// Dates marked `when` are recurring events whose exact day changes every year: the date
// shown is an estimate from the usual timing and is flagged "confirm date" in the app.
import { S, $, $$, api, esc, toast, guard, modal, pad, ymd, toUtc, postDay, photos } from './core.js';
import { holidays } from './holidays.js';
import { draw, prepare, renderDesignToAsset } from './studio.js';
import { openComposer } from './composer.js';

export const CATS = {
  canada: { label: 'Canadian holidays', color: '#EEB21E' },
  us: { label: 'US holidays', color: '#C93838' },
  awareness: { label: 'Awareness & business days', color: '#1E8E5A' },
  industry: { label: 'Industry events', color: '#3B5BDB' },
  tradeshow: { label: 'Trade shows', color: '#7A3FC4' },
  publication: { label: 'Publications & reports', color: '#0E8FA3' },
};
const CAT_DEFAULT = { canada: true, us: false, awareness: true, industry: true, tradeshow: true, publication: true };

export const INDUSTRIES = {
  consulting: { label: 'Management consulting', re: /consult|advis|strateg|management|business services/i },
  tech: { label: 'Technology & software', re: /tech|software|saas|\bit\b|digital|cyber|\bai\b|data|cloud|telecom/i },
  marketing: { label: 'Marketing & advertising', re: /market|advertis|brand|agency|communicat|\bpr\b|public relations|social|media|creative/i },
  finance: { label: 'Finance & accounting', re: /financ|account|bank|invest|insur|\btax|fintech|wealth|bookkeep/i },
  hr: { label: 'HR & talent', re: /\bhr\b|human res|talent|recruit|staffing|people|training|leadership|coach/i },
  retail: { label: 'Retail & e-commerce', re: /retail|e-?commerce|shop|store|consumer|fashion/i },
  health: { label: 'Healthcare', re: /health|medic|pharma|clinic|dental|wellness|care\b/i },
  manufacturing: { label: 'Manufacturing', re: /manufactur|industrial|factory|engineering|supply chain/i },
  construction: { label: 'Construction & real estate', re: /construct|build|real estate|realt|property|architect|contractor/i },
  hospitality: { label: 'Food & hospitality', re: /food|restaurant|hospitality|hotel|tourism|beverage|catering/i },
  energy: { label: 'Energy & mining', re: /energy|\boil\b|\bgas\b|mining|utilit|renewable/i },
  auto: { label: 'Automotive', re: /automo|\bcars?\b|vehicle|dealer/i },
};
export const matchIndustries = (text) => Object.keys(INDUSTRIES).filter((k) => INDUSTRIES[k].re.test(text || ''));

// ------------------------------------------------------------- date rules
const D = (y, m, day) => `${y}-${pad(m)}-${pad(day)}`;
const fixed = (m, day) => (y) => D(y, m, day);
const nth = (m, wd, n) => (y) => { const f = new Date(y, m - 1, 1); return D(y, m, 1 + ((wd - f.getDay() + 7) % 7) + (n - 1) * 7); };
const last = (m, wd) => (y) => { const l = new Date(y, m, 0); return D(y, m, l.getDate() - ((l.getDay() - wd + 7) % 7)); };
const plus = (rule, days) => (y) => { const t = new Date(rule(y) + 'T12:00'); t.setDate(t.getDate() + days); return ymd(t); };
const years = (rule, parity) => (y) => (y % 2 === parity ? rule(y) : null);
const thanksUS = nth(11, 4, 4);

// [id, name, rule, options]
const US = [
  ['us-ny', "New Year's Day", fixed(1, 1), { shared: true }],
  ['us-mlk', 'Martin Luther King Jr. Day', nth(1, 1, 3), { solemn: true, msg: 'Today we honour the legacy of Dr. Martin Luther King Jr. alongside our American clients, partners and friends.' }],
  ['us-pres', "Presidents' Day", nth(2, 1, 3), { msg: "It is Presidents' Day in the United States. To our American clients and partners: enjoy the long weekend. {B} is open as usual in Canada." }],
  ['us-mem', 'Memorial Day', last(5, 1), { solemn: true, msg: 'On Memorial Day, we join our American clients and partners in remembering those who gave their lives in service.' }],
  ['us-june', 'Juneteenth', fixed(6, 19), { solemn: true, msg: 'Today we mark Juneteenth alongside our American clients and partners: a day to reflect on freedom and the work still ahead.' }],
  ['us-july4', 'Independence Day', fixed(7, 4), { msg: 'Happy Fourth of July to our American clients, partners and friends, from all of us at {B}.', head: 'Happy Fourth of July', sub: 'To our American clients and friends' }],
  ['us-labor', 'Labor Day', nth(9, 1, 1), { shared: true }],
  ['us-columbus', "Indigenous Peoples' Day / Columbus Day", nth(10, 1, 2), { solemn: true, msg: "Today is Indigenous Peoples' Day in the United States. Our American clients and partners may be out of office; {B} is here when you are back." }],
  ['us-vets', 'Veterans Day', fixed(11, 11), { solemn: true, msg: 'On Veterans Day, we join our American clients and partners in honouring all who have served.' }],
  ['us-thanks', 'US Thanksgiving', thanksUS, { msg: 'Happy Thanksgiving to our American clients, partners and friends. We are grateful to work with you, from all of us at {B}.', head: 'Happy Thanksgiving', sub: 'To our American clients and friends' }],
  ['us-xmas', 'Christmas Day', fixed(12, 25), { shared: true }],
];

const AWARENESS = [
  ['aw-privacy', 'Data Privacy Day', fixed(1, 28), { tags: ['tech', 'consulting', 'finance', 'health'], msg: 'It is Data Privacy Day. One question worth asking this week: do you know what customer data you hold, and who can see it?', head: 'Data Privacy Day', sub: 'Know what you hold. Protect it.' }],
  ['aw-bhm', 'Black History Month begins', fixed(2, 1), { tags: ['all'], solemn: true, msg: 'February is Black History Month. This month {B} is listening to, learning from and celebrating Black leaders and entrepreneurs in our community.', head: 'Black History Month', sub: 'Listening, learning, celebrating' }],
  ['aw-val', "Valentine's Day", fixed(2, 14), { tags: ['retail', 'hospitality'], msg: "Happy Valentine's Day. Today we are thinking about the clients and partners who make the work worth doing. Thank you.", head: 'With thanks', sub: "Happy Valentine's Day" }],
  ['aw-iwd', "International Women's Day", fixed(3, 8), { tags: ['all'], msg: "On International Women's Day, {B} celebrates the women who lead, build and challenge us to do better: today and every day.", head: "International Women's Day", sub: 'Celebrating the women who lead' }],
  ['aw-whd', 'World Health Day', fixed(4, 7), { tags: ['health', 'hr'], msg: 'It is World Health Day. Healthy teams do better work. What is one thing your workplace does to look after its people?', head: 'World Health Day', sub: 'Healthy teams do better work' }],
  ['aw-earth', 'Earth Day', fixed(4, 22), { tags: ['all'], msg: 'Happy Earth Day. Small operational choices add up. What is one change your organization made this year?', head: 'Earth Day', sub: 'Small choices add up' }],
  ['aw-safety', 'World Day for Safety and Health at Work', fixed(4, 28), { tags: ['construction', 'manufacturing', 'energy', 'hr'], solemn: true, msg: 'Today is the World Day for Safety and Health at Work, and the National Day of Mourning in Canada. Everyone deserves to go home safe.', head: 'Safety at work', sub: 'Everyone goes home safe' }],
  ['aw-mh', 'Mental Health Awareness Month begins', fixed(5, 1), { tags: ['all'], msg: 'May is Mental Health Awareness Month. A reminder from {B}: checking in on your team is part of leading it.', head: 'Mental Health Month', sub: 'Checking in is part of leading' }],
  ['aw-password', 'World Password Day', nth(5, 4, 1), { tags: ['tech'], msg: 'It is World Password Day. Turn on multi-factor authentication today. It takes two minutes and stops most account takeovers.', head: 'World Password Day', sub: 'Turn on MFA today' }],
  ['aw-mothers', "Mother's Day", nth(5, 0, 2), { tags: ['retail', 'hospitality'], msg: "Happy Mother's Day from all of us at {B}.", head: "Happy Mother's Day", sub: 'From all of us at {B}' }],
  ['aw-gaad', 'Global Accessibility Awareness Day', nth(5, 4, 3), { tags: ['tech', 'marketing'], msg: 'It is Global Accessibility Awareness Day. If your website does not work for everyone, it does not work. Where would you start?', head: 'Accessibility Day', sub: 'Built for everyone' }],
  ['aw-hr', 'International HR Day', fixed(5, 20), { tags: ['hr', 'consulting'], msg: 'It is International HR Day. Thank you to the people teams who keep organizations human.', head: 'International HR Day', sub: 'Thank you, people teams' }],
  ['aw-pride', 'Pride Month begins', fixed(6, 1), { tags: ['all'], msg: 'Happy Pride. {B} stands with the 2SLGBTQ+ community: this month and all year.', head: 'Happy Pride', sub: 'This month and all year' }],
  ['aw-env', 'World Environment Day', fixed(6, 5), { tags: ['energy', 'manufacturing', 'construction'], msg: 'It is World Environment Day. Sustainability is now an operating question, not a side project.', head: 'World Environment Day', sub: 'An operating question' }],
  ['aw-fathers', "Father's Day", nth(6, 0, 3), { tags: ['retail', 'hospitality'], msg: "Happy Father's Day from all of us at {B}.", head: "Happy Father's Day", sub: 'From all of us at {B}' }],
  ['aw-nipd', 'National Indigenous Peoples Day', fixed(6, 21), { tags: ['all'], solemn: true, msg: 'Today is National Indigenous Peoples Day. {B} recognizes and celebrates the heritage, cultures and contributions of First Nations, Inuit and Métis peoples.', head: 'National Indigenous Peoples Day', sub: 'Recognizing and celebrating' }],
  ['aw-msme', 'Micro-, Small and Medium-sized Enterprises Day', fixed(6, 27), { tags: ['consulting', 'finance', 'business'], msg: 'It is MSME Day. Small and medium-sized businesses employ most Canadians. Today {B} salutes the owners who keep going.', head: 'Small business day', sub: 'Saluting the owners who keep going' }],
  ['aw-social', 'World Social Media Day', fixed(6, 30), { tags: ['marketing'], msg: 'It is Social Media Day. What is the best thing a connection made here has led to for you?', head: 'Social Media Day', sub: 'What has a connection led to?' }],
  ['aw-cyber', 'Cybersecurity Awareness Month begins', fixed(10, 1), { tags: ['tech', 'finance', 'consulting'], msg: 'October is Cybersecurity Awareness Month. Most breaches start with a person, not a system. When did your team last practise?', head: 'Cybersecurity Month', sub: 'It starts with people' }],
  ['aw-cs', 'Customer Service Week', nth(10, 1, 1), { tags: ['retail', 'hospitality', 'consulting'], when: 'First full week of October', msg: 'It is Customer Service Week. Thank you to the people who answer, fix and follow up.', head: 'Customer Service Week', sub: 'Thank you to those who follow up' }],
  ['aw-wmhd', 'World Mental Health Day', fixed(10, 10), { tags: ['all'], msg: 'Today is World Mental Health Day. Ask someone how they are really doing, and wait for the answer.', head: 'World Mental Health Day', sub: 'Ask. Then wait for the answer.' }],
  ['aw-sbw', 'Small Business Week (Canada)', nth(10, 0, 3), { tags: ['consulting', 'finance', 'business', 'retail'], when: 'Third week of October', msg: 'It is Small Business Week in Canada. {B} celebrates the entrepreneurs behind the businesses we all rely on.', head: 'Small Business Week', sub: 'Celebrating Canadian entrepreneurs' }],
  ['aw-pm', 'International Project Management Day', nth(11, 4, 1), { tags: ['consulting', 'tech', 'construction'], msg: 'It is International Project Management Day. Here is to the people who turn plans into finished work.', head: 'Project Management Day', sub: 'From plan to finished work' }],
  ['aw-quality', 'World Quality Day', nth(11, 4, 2), { tags: ['consulting', 'manufacturing'], msg: 'It is World Quality Day. Quality is not a department: it is how the work gets done.', head: 'World Quality Day', sub: 'How the work gets done' }],
  ['aw-gew', 'Global Entrepreneurship Week', nth(11, 1, 3), { tags: ['consulting', 'finance', 'business', 'tech'], when: 'Mid-November', msg: 'It is Global Entrepreneurship Week. What is the best advice you got when you were starting out?', head: 'Entrepreneurship Week', sub: 'Best advice you ever got?' }],
  ['aw-bf', 'Black Friday', plus(thanksUS, 1), { tags: ['retail', 'marketing', 'hospitality'], msg: 'Black Friday is here. A thought from {B}: the best offer is the one your customer still values in January.', head: 'Black Friday', sub: 'Value that lasts past the sale' }],
  ['aw-sbs', 'Small Business Saturday', plus(thanksUS, 2), { tags: ['retail', 'business', 'hospitality'], msg: 'It is Small Business Saturday. Shop local today, and tell us about a small business you love.', head: 'Shop small', sub: 'Small Business Saturday' }],
  ['aw-cm', 'Cyber Monday', plus(thanksUS, 4), { tags: ['retail', 'tech', 'marketing'], msg: 'Cyber Monday: the busiest online shopping day of the year. Is your website ready for the traffic?', head: 'Cyber Monday', sub: 'Ready for the traffic?' }],
  ['aw-gt', 'Giving Tuesday', plus(thanksUS, 5), { tags: ['all'], msg: 'It is Giving Tuesday. Which cause matters most to you this year? Tell us: the {B} team would like to hear about it.', head: 'Giving Tuesday', sub: 'Which cause matters to you?' }],
  ['aw-idpd', 'International Day of Persons with Disabilities', fixed(12, 3), { tags: ['hr', 'health'], solemn: true, msg: 'Today is the International Day of Persons with Disabilities. Inclusion is built into how work is designed, not added afterwards.', head: 'Inclusion by design', sub: 'International Day of Persons with Disabilities' }],
  ['aw-vol', 'International Volunteer Day', fixed(12, 5), { tags: ['all'], msg: 'It is International Volunteer Day. Thank you to everyone who gives their time to make our communities stronger.', head: 'Thank you, volunteers', sub: 'International Volunteer Day' }],
];

// Fiscal and business deadlines: exact dates.
const DEADLINES = [
  ['in-q1', 'First quarter ends', fixed(3, 31), { tags: ['business', 'finance'], msg: 'The first quarter closes today. What worked, what did not, and what will you change for Q2?', head: 'Q1 is a wrap', sub: 'What will you change for Q2?' }],
  ['in-fy-ca', 'Government of Canada fiscal year-end', fixed(3, 31), { tags: ['consulting', 'finance'], msg: 'March 31 is fiscal year-end for the Government of Canada and many organizations. A good moment to review what the year delivered.', head: 'Fiscal year-end', sub: 'Review what the year delivered' }],
  ['in-tax-us', 'US Tax Day', fixed(4, 15), { tags: ['finance'], msg: 'It is Tax Day in the United States. To our American clients: we hope filing was painless.', head: 'US Tax Day', sub: 'April 15' }],
  ['in-tax-ca', 'Canadian personal tax filing deadline', fixed(4, 30), { tags: ['finance', 'business'], msg: 'April 30 is the personal tax filing deadline in Canada. Filed already? Then this week is a good time to plan next year.', head: 'Tax deadline: April 30', sub: 'Filed? Plan next year now.' }],
  ['in-tax-se', 'Canadian self-employed tax filing deadline', fixed(6, 15), { tags: ['finance', 'business', 'consulting'], msg: 'June 15 is the filing deadline for self-employed Canadians. Reminder: any balance owing was due April 30.', head: 'Self-employed? June 15', sub: 'Filing deadline in Canada' }],
  ['in-h1', 'Mid-year point', fixed(6, 30), { tags: ['business', 'consulting'], msg: 'Half the year is done. Which of your January goals still deserves a place on the list?', head: 'Halfway through the year', sub: 'Which goals still matter?' }],
  ['in-q3', 'Third quarter ends', fixed(9, 30), { tags: ['business', 'finance'], msg: 'Q3 closes today. Ninety days left: what is the one result that would make the year?', head: 'Ninety days left', sub: 'What would make the year?' }],
  ['in-plan', 'Annual planning season', fixed(10, 15), { tags: ['business', 'consulting'], when: 'October to November', msg: 'Planning season is here. Before you set next year’s targets, decide what you will stop doing.', head: 'Planning next year?', sub: 'Start with what to stop' }],
  ['in-ye', 'Calendar year-end', fixed(12, 31), { tags: ['business', 'finance', 'consulting'], msg: 'Thank you for a year of trust and good work. From all of us at {B}: see you in the new year.', head: 'Thank you for this year', sub: 'See you in the new year' }],
];

// Recurring events. `when` = usual timing; the rule gives an estimate to confirm.
const EVENTS = [
  ['ev-wef', 'World Economic Forum Annual Meeting', nth(1, 1, 3), { tags: ['business', 'consulting', 'finance'], when: 'Usually the third week of January', where: 'Davos, Switzerland', short: 'Davos' }],
  ['ev-himss', 'HIMSS Global Health Conference', nth(3, 1, 2), { tags: ['health', 'tech'], when: 'Usually February or March', where: 'United States', short: 'HIMSS' }],
  ['ev-sxsw', 'SXSW', nth(3, 5, 2), { tags: ['tech', 'marketing'], when: 'Usually mid-March', where: 'Austin, Texas', short: 'SXSW' }],
  ['ev-adobe', 'Adobe Summit', nth(3, 2, 3), { tags: ['marketing', 'tech'], when: 'Usually March', where: 'Las Vegas', short: 'Adobe Summit' }],
  ['ev-rsa', 'RSA Conference', last(4, 1), { tags: ['tech'], when: 'Usually late April or May', where: 'San Francisco', short: 'RSA Conference' }],
  ['ev-atd', 'ATD International Conference', nth(5, 0, 3), { tags: ['hr', 'consulting'], when: 'Usually May', where: 'United States', short: 'ATD' }],
  ['ev-io', 'Google I/O', nth(5, 2, 3), { tags: ['tech'], when: 'Usually May', where: 'Mountain View, California', short: 'Google I/O' }],
  ['ev-wsv', 'Web Summit Vancouver', last(5, 2), { tags: ['tech', 'business'], when: 'Usually late May', where: 'Vancouver', short: 'Web Summit Vancouver' }],
  ['ev-wwdc', 'Apple WWDC', nth(6, 1, 2), { tags: ['tech'], when: 'Usually early June', where: 'Cupertino, California', short: 'WWDC' }],
  ['ev-cannes', 'Cannes Lions Festival of Creativity', nth(6, 1, 3), { tags: ['marketing'], when: 'Usually the third week of June', where: 'Cannes, France', short: 'Cannes Lions' }],
  ['ev-shrm', 'SHRM Annual Conference', nth(6, 0, 4), { tags: ['hr'], when: 'Usually June', where: 'United States', short: 'SHRM' }],
  ['ev-blackhat', 'Black Hat USA', nth(8, 3, 1), { tags: ['tech'], when: 'Usually early August', where: 'Las Vegas', short: 'Black Hat' }],
  ['ev-inbound', 'INBOUND', nth(9, 3, 1), { tags: ['marketing'], when: 'Usually September', where: 'United States', short: 'INBOUND' }],
  ['ev-hrtech', 'HR Technology Conference', nth(9, 2, 4), { tags: ['hr', 'tech'], when: 'Usually September or October', where: 'Las Vegas', short: 'HR Tech' }],
  ['ev-dreamforce', 'Dreamforce', nth(9, 2, 3), { tags: ['tech', 'marketing'], when: 'Usually September or October', where: 'San Francisco', short: 'Dreamforce' }],
  ['ev-elevate', 'Elevate Festival', nth(10, 2, 1), { tags: ['tech', 'business'], when: 'Usually autumn', where: 'Toronto', short: 'Elevate' }],
  ['ev-adweek', 'Advertising Week New York', nth(10, 1, 1), { tags: ['marketing'], when: 'Usually October', where: 'New York', short: 'Advertising Week' }],
  ['ev-gartner', 'Gartner IT Symposium/Xpo', nth(10, 1, 3), { tags: ['tech', 'consulting'], when: 'Usually October', where: 'Orlando, Florida', short: 'Gartner Symposium' }],
  ['ev-hlth', 'HLTH', nth(10, 0, 3), { tags: ['health'], when: 'Usually October', where: 'Las Vegas', short: 'HLTH' }],
  ['ev-money', 'Money20/20 USA', last(10, 0), { tags: ['finance'], when: 'Usually late October', where: 'Las Vegas', short: 'Money20/20' }],
  ['ev-pmi', 'PMI Global Summit', nth(10, 3, 3), { tags: ['consulting', 'construction'], when: 'Usually autumn', where: 'United States', short: 'PMI Global Summit' }],
  ['ev-websummit', 'Web Summit', nth(11, 1, 2), { tags: ['tech', 'business'], when: 'Usually November', where: 'Lisbon, Portugal', short: 'Web Summit' }],
  ['ev-ignite', 'Microsoft Ignite', nth(11, 1, 3), { tags: ['tech'], when: 'Usually November', where: 'United States', short: 'Microsoft Ignite' }],
  ['ev-reinvent', 'AWS re:Invent', plus(thanksUS, 4), { tags: ['tech'], when: 'Usually the week after US Thanksgiving', where: 'Las Vegas', short: 're:Invent' }],
];

const SHOWS = [
  ['ts-ces', 'CES', nth(1, 2, 1), { tags: ['tech', 'retail', 'auto'], when: 'Usually early January', where: 'Las Vegas' }],
  ['ts-nrf', "NRF Retail's Big Show", nth(1, 0, 2), { tags: ['retail'], when: 'Usually mid-January', where: 'New York', short: 'NRF Big Show' }],
  ['ts-ids', 'Interior Design Show', nth(1, 4, 4), { tags: ['construction'], when: 'Usually January', where: 'Toronto', short: 'IDS Toronto' }],
  ['ts-woc', 'World of Concrete', nth(1, 2, 3), { tags: ['construction'], when: 'Usually January', where: 'Las Vegas' }],
  ['ts-ibs', "NAHB International Builders' Show", nth(2, 2, 2), { tags: ['construction'], when: 'Usually January or February', where: 'United States', short: "Builders' Show" }],
  ['ts-cias', 'Canadian International AutoShow', nth(2, 5, 2), { tags: ['auto'], when: 'Usually mid-February', where: 'Toronto', short: 'AutoShow' }],
  ['ts-mwc', 'MWC Barcelona', last(2, 1), { tags: ['tech'], when: 'Usually late February or early March', where: 'Barcelona', short: 'MWC' }],
  ['ts-pdac', 'PDAC Convention', nth(3, 0, 1), { tags: ['energy'], when: 'Usually early March', where: 'Toronto', short: 'PDAC' }],
  ['ts-expowest', 'Natural Products Expo West', nth(3, 2, 2), { tags: ['hospitality', 'retail'], when: 'Usually March', where: 'Anaheim, California', short: 'Expo West' }],
  ['ts-mipim', 'MIPIM', nth(3, 2, 2), { tags: ['construction'], when: 'Usually March', where: 'Cannes, France' }],
  ['ts-shoptalk', 'Shoptalk', nth(3, 1, 4), { tags: ['retail'], when: 'Usually March', where: 'Las Vegas' }],
  ['ts-rc', 'RC Show (Restaurants Canada)', nth(4, 1, 2), { tags: ['hospitality'], when: 'Usually spring', where: 'Toronto', short: 'RC Show' }],
  ['ts-nab', 'NAB Show', nth(4, 6, 2), { tags: ['marketing'], when: 'Usually April', where: 'Las Vegas' }],
  ['ts-hannover', 'Hannover Messe', nth(4, 1, 4), { tags: ['manufacturing', 'energy'], when: 'Usually April', where: 'Hannover, Germany' }],
  ['ts-sial', 'SIAL Canada', nth(5, 2, 1), { tags: ['hospitality', 'retail'], when: 'Usually spring', where: 'Toronto or Montréal' }],
  ['ts-nra', 'National Restaurant Association Show', nth(5, 6, 3), { tags: ['hospitality'], when: 'Usually May', where: 'Chicago', short: 'NRA Show' }],
  ['ts-icsc', 'ICSC Las Vegas', nth(5, 0, 3), { tags: ['retail', 'construction'], when: 'Usually May', where: 'Las Vegas' }],
  ['ts-ges', 'Global Energy Show', nth(6, 2, 2), { tags: ['energy'], when: 'Usually June', where: 'Calgary' }],
  ['ts-imts', 'IMTS', years(nth(9, 1, 2), 0), { tags: ['manufacturing'], when: 'Usually September, even years', where: 'Chicago' }],
  ['ts-cmts', 'Canadian Manufacturing Technology Show', years(last(9, 1), 1), { tags: ['manufacturing'], when: 'Usually autumn, odd years', where: 'Toronto', short: 'CMTS' }],
  ['ts-medica', 'MEDICA', nth(11, 1, 3), { tags: ['health'], when: 'Usually mid-November', where: 'Düsseldorf, Germany' }],
  ['ts-buildings', 'The Buildings Show', plus(thanksUS, 6), { tags: ['construction'], when: 'Usually late November or early December', where: 'Toronto' }],
];

const PUBS = [
  ['pb-wefrisk', 'WEF Global Risks Report', nth(1, 3, 2), { tags: ['business', 'consulting', 'finance'], when: 'Usually mid-January', short: 'Global Risks Report' }],
  ['pb-edelman', 'Edelman Trust Barometer', nth(1, 2, 3), { tags: ['business', 'consulting', 'marketing'], when: 'Usually January', short: 'Trust Barometer' }],
  ['pb-pwc', 'PwC Global CEO Survey', nth(1, 1, 3), { tags: ['business', 'consulting'], when: 'Usually January', short: 'CEO Survey' }],
  ['pb-hct', 'Deloitte Global Human Capital Trends', nth(3, 2, 2), { tags: ['hr', 'consulting'], when: 'Usually the first quarter', short: 'Human Capital Trends' }],
  ['pb-litop', 'LinkedIn Top Companies', nth(4, 2, 2), { tags: ['hr', 'business'], when: 'Usually April', short: 'LinkedIn Top Companies' }],
  ['pb-brandz', 'Kantar BrandZ Most Valuable Global Brands', nth(6, 3, 2), { tags: ['marketing'], when: 'Usually May or June', short: 'Kantar BrandZ' }],
  ['pb-f500', 'Fortune 500', nth(6, 2, 1), { tags: ['business', 'finance', 'consulting'], when: 'Usually early June' }],
  ['pb-forbes2000', 'Forbes Global 2000', nth(6, 4, 2), { tags: ['business', 'finance'], when: 'Usually June' }],
  ['pb-fg500', 'Fortune Global 500', last(7, 2), { tags: ['business', 'finance'], when: 'Usually late July or August' }],
  ['pb-hype', 'Gartner Hype Cycle for Emerging Technologies', nth(8, 2, 3), { tags: ['tech', 'consulting'], when: 'Usually August', short: 'Gartner Hype Cycle' }],
  ['pb-inc', 'Inc. 5000', nth(8, 2, 2), { tags: ['business'], when: 'Usually August' }],
  ['pb-rob', "Report on Business: Canada's Top Growing Companies", last(9, 5), { tags: ['business', 'consulting', 'finance'], when: 'Usually late September', short: "Canada's Top Growing Companies" }],
  ['pb-interbrand', 'Interbrand Best Global Brands', nth(10, 4, 2), { tags: ['marketing'], when: 'Usually October', short: 'Best Global Brands' }],
  ['pb-fast50', 'Deloitte Technology Fast 50', nth(11, 3, 2), { tags: ['tech'], when: 'Usually November', short: 'Technology Fast 50' }],
  ['pb-thinkers', 'Thinkers50 Ranking', years(nth(11, 1, 2), 1), { tags: ['consulting', 'business', 'hr'], when: 'Usually November, odd years', short: 'Thinkers50' }],
  ['pb-top100', "Canada's Top 100 Employers", nth(11, 2, 3), { tags: ['hr', 'business'], when: 'Usually November' }],
];

// --------------------------------------------------------------- settings
export function kdSettings() {
  const k = S.data.settings.keyDates || {};
  return { cats: { ...CAT_DEFAULT, ...(k.cats || {}) }, industry: k.industry ?? guessIndustry(), custom: k.custom || [], overrides: k.overrides || {} };
}
function guessIndustry() {
  const b = S.data.brand, text = [b.tagline, b.audience, b.site && b.site.description].join(' ');
  const hit = matchIndustries(text)[0];
  return hit ? INDUSTRIES[hit].label : '';
}
const saveKd = (patch, quiet = false) => api('PUT', 'settings', { keyDates: { ...kdSettings(), ...patch } }, { quiet });

// ---------------------------------------------------------- suggestion engine
const fill = (s) => String(s || '').replace(/\{B\}/g, S.data.brand.name || 'our team');

function compose(cat, name, year, o) {
  const short = o.short || name, at = o.where ? ` in ${o.where}` : '';
  if (o.msg) return { msg: fill(o.msg), head: fill(o.head || name), sub: fill(o.sub || 'From all of us at {B}') };
  if (cat === 'canada' || cat === 'us') {
    if (o.solemn) return { msg: fill(`Today, on ${name}, the {B} team pauses to reflect and remember.`), head: name, sub: 'We pause to reflect' };
    return { msg: fill(`Happy ${name} from all of us at {B}. Wishing you a restful day with the people who matter most.`), head: `Happy ${name}`, sub: fill('From all of us at {B}') };
  }
  if (cat === 'industry') return { msg: fill(`${name} ${year} is coming up${at}. {B} will be following the conversation and sharing what it means for your business. What are you hoping to hear about?`), head: `${short} ${year}`, sub: "What we're watching" };
  if (cat === 'tradeshow') return { msg: fill(`${name} ${year} is coming up${at}. Going? Tell us what is on your list: {B} will share the ideas worth bringing back.`), head: `${short} ${year}`, sub: o.where || 'The ideas worth bringing back' };
  if (cat === 'publication') return { msg: fill(`${name} ${year} is due out around now. {B} will be reading it closely and sharing the takeaways that matter for leaders.`), head: short, sub: 'Our key takeaways' };
  return { msg: fill(`${name}: a note from {B}.`), head: name, sub: '' };
}

function build(cat, row, year, overrides) {
  const [id, name, rule, o = {}] = row;
  const est = rule(year);
  if (!est) return null;
  const key = `${id}-${year}`, set = overrides[key];
  return { key, cat, name, date: set || est, approx: !!o.when && !set, when: o.when || '', where: o.where || '', solemn: !!o.solemn,
    tags: o.tags || ['all'], shared: !!o.shared, ...compose(cat, name, year, o) };
}

// All key dates between two ISO days for the switched-on categories and the industry text.
export function keyDates(from, to, opts = {}) {
  const k = kdSettings(), cats = opts.cats || k.cats, query = (opts.industry ?? k.industry).trim();
  const inds = matchIndustries(query), q = query.toLowerCase();
  const out = [], regions = S.data.settings.holidayRegions;
  const relevant = (it) => {
    if (['canada', 'us'].includes(it.cat) || it.tags.includes('all')) return true;
    if (!q) return true;
    if (it.tags.some((t) => inds.includes(t))) return true;
    if (it.tags.includes('business') && (inds.length || it.cat !== 'awareness')) return true;
    return `${it.name} ${it.where}`.toLowerCase().includes(q);
  };
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    const ca = cats.canada ? holidays(y, regions) : [];
    ca.forEach((h) => out.push({ key: `ca-${h.date}-${h.name}`, cat: 'canada', name: h.name, date: h.date, approx: false, when: '', where: h.note || '', solemn: !!h.solemn, tags: ['all'],
      ...compose('canada', h.name, y, { solemn: h.solemn, ...(h.name.includes('Truth and Reconciliation') ? { msg: 'Today, on the National Day for Truth and Reconciliation, the {B} team pauses to listen, learn and reflect.', head: 'Truth and Reconciliation', sub: 'Listen. Learn. Reflect.' } : {}) }) }));
    const caDates = new Set(ca.map((h) => h.date));
    const sets = [['us', US], ['awareness', AWARENESS], ['industry', DEADLINES], ['industry', EVENTS], ['tradeshow', SHOWS], ['publication', PUBS]];
    sets.forEach(([cat, rows]) => { if (cats[cat]) rows.forEach((r) => { const it = build(cat, r, y, k.overrides); if (it && !(it.shared && caDates.has(it.date))) out.push(it); }); });
  }
  k.custom.forEach((c) => { if (cats[c.cat]) out.push({ key: c.id, cat: c.cat, name: c.name, date: c.date, approx: !!c.approx, when: c.when || '', where: c.where || '', solemn: false, tags: ['all'], custom: true, source: c.source || 'user',
    msg: c.msg || compose(c.cat, c.name, c.date.slice(0, 4), c).msg, head: c.head || c.name, sub: c.sub || '' }); });
  return out.filter((it) => it.date >= from && it.date <= to && (it.custom || relevant(it))).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function keyDateMap(from, to) {
  const map = {};
  keyDates(from, to).forEach((it) => { (map[it.date] = map[it.date] || []).push(it); });
  return map;
}

// ------------------------------------------------------------------ visuals
export function specFor(it, i = 0) {
  const pool = photos(), festive = ['canada', 'us'].includes(it.cat);
  const template = festive ? (it.solemn ? 'bold' : 'festive') : it.solemn ? 'bold' : { awareness: 'bold', industry: 'split', tradeshow: pool.length ? 'photo' : 'bold', publication: 'quote' }[it.cat] || 'bold';
  const photoId = pool.length && ['split', 'photo'].includes(template) ? pool[i % pool.length].id : '';
  return { format: 'square', template, headline: it.head, subline: it.sub, photoId, logo: true };
}

async function paintThumb(canvas, it, i) {
  const spec = specFor(it, i), big = document.createElement('canvas');
  big.width = big.height = 1080;
  draw(big.getContext('2d'), 1080, 1080, spec, await prepare(spec));
  if (canvas.isConnected) canvas.getContext('2d').drawImage(big, 0, 0, canvas.width, canvas.height);
}

const planned = (it) => S.data.posts.some((p) => postDay(p) === it.date && (p.holiday === it.name || p.topic === it.name));

// Open the composer with the proposed message and a freshly rendered visual.
export async function postFromKeyDate(it, i = 0) {
  const a = await renderDesignToAsset(specFor(it, i), it.head);
  await api('GET', 'state', undefined, { quiet: true });
  openComposer({ date: it.date, caption: it.msg, topic: it.name, mediaId: a.id });
}

// -------------------------------------------------------------------- panel
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ui = { span: 3 };

export function openKeyDates(start = new Date()) {
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const md = modal(`<div class="mhead"><h2>Key dates</h2><span class="muted">Suggested moments to post about, with a proposed message and visual</span><button class="x" data-close>×</button></div>
    <div class="mbody kd-body">
      <label for="kdq">Your industry, or an event to look for</label>
      <div class="row wrap"><input id="kdq" list="kdlist" placeholder="e.g. management consulting, retail, CES" autocomplete="off">
        <datalist id="kdlist">${Object.values(INDUSTRIES).map((i) => `<option value="${esc(i.label)}">`).join('')}</datalist>
        <div class="seg" id="kdspan">${[[1, MONTHS[first.getMonth()]], [3, '3 months'], [12, '12 months']].map(([n, l]) => `<button data-n="${n}">${l}</button>`).join('')}</div></div>
      <div class="kd-hint muted" id="kdhint"></div>
      <label>Categories <span class="muted">— click to show or hide</span></label>
      <div class="kd-cats" id="kdcats"></div>
      <div id="kdlistbox"></div>
      <details class="kd-add"><summary>Add your own date</summary><div class="row wrap">
        <input type="date" id="kdnd"><input id="kdnn" placeholder="Name — e.g. our annual client event">
        <select id="kdnc">${Object.keys(CATS).filter((c) => !['canada', 'us'].includes(c)).map((c) => `<option value="${c}">${CATS[c].label}</option>`).join('')}</select>
        <button class="btn" id="kdna">Add</button></div></details>
    </div>
    <div class="mfoot"><button class="btn accent" id="kdai">✦ Find more with AI</button><span class="grow"></span>
      <button class="btn" data-close>Close</button><button class="btn primary" id="kdgo" disabled>Create drafts</button></div>`, 'wide');
  const el = md.el, picked = new Set();
  let items = [];
  $('#kdq', el).value = kdSettings().industry;

  function range() {
    const end = new Date(first.getFullYear(), first.getMonth() + ui.span, 0);
    const today = ymd(new Date()), from = ymd(first);
    return [from < today && ui.span > 1 ? today : from, ymd(end)];
  }

  function drawList() {
    const k = kdSettings(), [from, to] = range(), q = $('#kdq', el).value;
    const all = keyDates(from, to, { cats: Object.fromEntries(Object.keys(CATS).map((c) => [c, true])), industry: q });
    const counts = {};
    all.forEach((it) => { counts[it.cat] = (counts[it.cat] || 0) + 1; });
    $('#kdcats', el).innerHTML = Object.keys(CATS).map((c) => `<button class="kd-chip ${k.cats[c] ? 'on' : ''}" data-cat="${c}" aria-pressed="${!!k.cats[c]}" style="--c:${CATS[c].color}">
      <i></i>${CATS[c].label}<b>${counts[c] || 0}</b></button>`).join('');
    $$('#kdspan button', el).forEach((b) => b.classList.toggle('on', +b.dataset.n === ui.span));
    const inds = matchIndustries(q);
    $('#kdhint', el).textContent = !q.trim() ? 'Showing dates for every industry. Type yours to narrow the list.'
      : inds.length ? `Matched: ${inds.map((i) => INDUSTRIES[i].label).join(', ')}.` : 'No industry matched: showing general business dates and anything with that name.';
    items = all.filter((it) => k.cats[it.cat]);
    [...picked].forEach((key) => { if (!items.some((it) => it.key === key)) picked.delete(key); });
    let html = '', month = '';
    items.forEach((it, i) => {
      const dt = new Date(it.date + 'T12:00'), mk = `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
      if (mk !== month) { month = mk; html += `<h4 class="kd-month">${mk}</h4>`; }
      const done = planned(it);
      html += `<div class="kd-row" data-key="${esc(it.key)}">
        <input type="checkbox" class="kd-pick" aria-label="Select ${esc(it.name)}" ${picked.has(it.key) ? 'checked' : ''} ${done ? 'disabled' : ''}>
        <canvas class="kd-thumb" width="216" height="216" data-i="${i}"></canvas>
        <div class="hol-date"><b>${dt.getDate()}</b><span>${MONTHS[dt.getMonth()].slice(0, 3)}</span></div>
        <div class="grow"><div class="kd-title"><b>${esc(it.name)}</b><span class="kd-tag" style="--c:${CATS[it.cat].color}">${CATS[it.cat].label}</span>
            ${it.approx ? '<span class="kd-warn">Confirm date</span>' : ''}${it.source === 'ai' ? '<span class="kd-warn">AI suggestion</span>' : ''}</div>
          <small class="muted">${esc([it.when, it.where].filter(Boolean).join(' · '))}</small>
          <p class="kd-msg">${esc(it.msg)}</p>
          ${it.approx && !it.custom ? `<label class="kd-fix">Exact date <input type="date" value="${it.date}" data-fix="${esc(it.key)}"></label>` : ''}</div>
        <div class="kd-act">${done ? '<span class="status scheduled">Planned</span>' : `<button class="btn sm" data-make="${i}">Create post</button>`}
          ${it.custom ? `<button class="btn sm ghost" data-rm="${esc(it.key)}" title="Remove this date">Remove</button>` : ''}</div></div>`;
    });
    $('#kdlistbox', el).innerHTML = html || '<p class="muted pad">No dates in this period for the selected categories. Switch a category on, or widen the period.</p>';
    wire();
    sync();
    (async () => { for (const c of $$('.kd-thumb', el)) { if (!c.isConnected) return; await paintThumb(c, items[+c.dataset.i], +c.dataset.i); await new Promise((r) => setTimeout(r)); } })();
  }

  function sync() {
    const b = $('#kdgo', el);
    b.disabled = !picked.size;
    b.textContent = picked.size ? `Create ${picked.size} draft${picked.size > 1 ? 's' : ''}` : 'Create drafts';
  }

  function wire() {
    $$('.kd-chip', el).forEach((b) => (b.onclick = () => guard(async () => {
      const k = kdSettings();
      await saveKd({ cats: { ...k.cats, [b.dataset.cat]: !k.cats[b.dataset.cat] } });
      drawList();
    })));
    $$('.kd-pick', el).forEach((c) => (c.onchange = () => { const key = c.closest('.kd-row').dataset.key; c.checked ? picked.add(key) : picked.delete(key); sync(); }));
    $$('[data-make]', el).forEach((b) => (b.onclick = () => guard(async () => { const it = items[+b.dataset.make]; md.close(); await postFromKeyDate(it, +b.dataset.make); }, b)));
    $$('[data-fix]', el).forEach((inp) => (inp.onchange = () => guard(async () => {
      if (!inp.value) return;
      await saveKd({ overrides: { ...kdSettings().overrides, [inp.dataset.fix]: inp.value } });
      toast('Date confirmed.'); drawList();
    })));
    $$('[data-rm]', el).forEach((b) => (b.onclick = () => guard(async () => { await saveKd({ custom: kdSettings().custom.filter((c) => c.id !== b.dataset.rm) }); drawList(); })));
  }

  let timer;
  $('#kdq', el).oninput = () => { clearTimeout(timer); drawList(); timer = setTimeout(() => saveKd({ industry: $('#kdq', el).value.trim() }).catch(() => {}), 600); };
  $$('#kdspan button', el).forEach((b) => (b.onclick = () => { ui.span = +b.dataset.n; drawList(); }));

  $('#kdna', el).onclick = (e) => guard(async () => {
    const date = $('#kdnd', el).value, name = $('#kdnn', el).value.trim(), cat = $('#kdnc', el).value;
    if (!date || !name) throw new Error('Enter a date and a name.');
    const k = kdSettings();
    await saveKd({ custom: [...k.custom, { id: 'c' + Date.now().toString(36), date, name, cat, source: 'user' }], cats: { ...k.cats, [cat]: true } });
    $('#kdnn', el).value = '';
    toast('Date added.'); drawList();
  }, e.currentTarget);

  $('#kdai', el).onclick = (e) => guard(async () => {
    if (!S.data.ai.enabled) throw new Error('Add an Anthropic API key in Settings to search for more events in your field.');
    const [from, to] = range(), k = kdSettings();
    const res = await api('POST', 'keydates', { industry: $('#kdq', el).value.trim(), from, to, known: items.map((it) => it.name) }, { quiet: true });
    const fresh = (res.dates || []).filter((d) => !k.custom.some((c) => c.name === d.name && c.date === d.date));
    if (!fresh.length) return toast('No further dates found for this period.');
    await saveKd({ custom: [...k.custom, ...fresh] });
    toast(`${fresh.length} suggestion${fresh.length > 1 ? 's' : ''} added. Confirm each date before you post.`, 'ok', 7000);
    drawList();
  }, e.currentTarget);

  $('#kdgo', el).onclick = (e) => guard(async () => {
    const todo = items.map((it, i) => [it, i]).filter(([it]) => picked.has(it.key));
    const connected = Object.keys(S.data.channels).filter((c) => S.data.channels[c].connected && c !== 'youtube');
    const channels = connected.length ? connected : ['facebook', 'instagram', 'linkedin'];
    for (const [it, i] of todo) {
      const a = await renderDesignToAsset(specFor(it, i), it.head);
      await api('POST', 'posts', { caption: it.msg, captions: {}, channels, mediaIds: [a.id], topic: it.name, holiday: it.name, title: '',
        scheduledAt: toUtc(it.date, S.data.settings.defaultTime), status: 'draft' }, { quiet: true });
    }
    md.close();
    await api('GET', 'state');
    toast(`${todo.length} draft${todo.length > 1 ? 's' : ''} created. Review each one, then schedule.`, 'ok', 7000);
  }, e.currentTarget);

  drawList();
}
