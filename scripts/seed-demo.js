/**
 * Seed a DEMO Firebase project with fictional data so the app looks alive.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   DEMO_PASSWORD='choose-a-password' node scripts/seed-demo.js
 *
 * Creates:
 *   - 2 sign-in accounts: demo-admin@example.com, demo-member@example.com
 *   - 40 fictional member profiles (Firestore only — no real people)
 *   - community/northstar with all members
 *   - sample messages in the Inner Circle and Growth Lab rooms
 *   - room-settings/growth-lab invite list
 *
 * Run ONLY against a throwaway demo project, never a production one.
 */
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const { Timestamp } = admin.firestore;

const FIRST = ['Ava', 'Maya', 'Lena', 'Nora', 'Iris', 'Tessa', 'Priya', 'Chloe', 'Zara', 'Elena',
  'Grace', 'Hana', 'Jade', 'Kira', 'Leah', 'Mira', 'Nina', 'Olive', 'Paige', 'Quinn',
  'Rosa', 'Sofia', 'Talia', 'Uma', 'Vera', 'Willa', 'Ximena', 'Yara', 'Zoe', 'Amara',
  'Bella', 'Cora', 'Dana', 'Eden', 'Fiona', 'Gia', 'Hazel', 'Ines', 'June', 'Kaia'];
const LAST = ['Reyes', 'Chen', 'Patel', 'Brooks', 'Nguyen', 'Hart', 'Silva', 'Park', 'Adams', 'Cole'];

const MESSAGES = [
  'Week 1 focus locked in: launch my workshop by June 30 🎯',
  'Daily minimum today: 10 minutes on the outline. Done!',
  'Anyone else doing their weekly review on Sunday nights?',
  'Made it smaller like Ava said — finally sent my first outreach email.',
  'Done is data. My first post flopped but I learned a ton.',
  'Time block protected three days in a row 🙌',
  'What would make this easy? Prepping my desk the night before.',
  'Review question 3 hit hard: what will I change next week?',
  'Celebrating: 5 sign-ups for my first paid session!',
  'Momentum beats motivation. Showing up even when I don’t feel like it.',
  'Sharing my plan here so you all hold me accountable 😅',
  'Tip: calendar block > to-do list. Game changer.',
];

const daysAgo = (d) => Timestamp.fromDate(new Date(Date.now() - d * 86400000));

async function ensureAuthUser(email, name) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('Set DEMO_PASSWORD');
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch {
    return (await auth.createUser({ email, password, displayName: name })).uid;
  }
}

async function main() {
  const adminUid = await ensureAuthUser('demo-admin@example.com', 'Coach Ava');
  const memberUid = await ensureAuthUser('demo-member@example.com', 'Demo Member');

  const users = [
    { id: adminUid, displayName: 'Coach Ava', role: 'admin', email: 'demo-admin@example.com' },
    { id: memberUid, displayName: 'Demo Member', role: 'member', email: 'demo-member@example.com' },
  ];
  for (let i = 0; i < 40; i++) {
    users.push({
      id: `demo-member-${String(i + 1).padStart(2, '0')}`,
      displayName: `${FIRST[i]} ${LAST[i % LAST.length]}`,
      role: 'member',
    });
  }

  const batch = db.batch();
  users.forEach((u, i) => {
    const allAccess = i % 3 !== 2; // two thirds on the all-access tier
    batch.set(db.doc(`users/${u.id}`), {
      displayName: u.displayName,
      ...(u.email ? { email: u.email } : {}),
      role: u.role,
      joinedAt: daysAgo(120 - i * 2),
      lastSeen: daysAgo(i % 7),
      isOnline: i % 5 === 0,
      subscriptionTier: allAccess || u.role === 'admin' ? 'all-access' : 'standard',
      subscriptionStatus: 'active',
      hasEliteAccess: allAccess || u.role === 'admin',
    });
  });

  batch.set(db.doc('community/northstar'), {
    name: 'Northstar Community',
    adminId: adminUid,
    adminIds: [adminUid],
    memberIds: users.map((u) => u.id),
    memberCount: users.length,
    createdAt: daysAgo(180),
    settings: { maxMembers: 500, allowMedia: true, allowLinks: true, chatLocked: false, allowedSpeakers: [] },
  });

  batch.set(db.doc('room-settings/growth-lab'), {
    invitedUserIds: users.slice(0, 20).map((u) => u.id),
  }, { merge: true });

  MESSAGES.forEach((content, i) => {
    const sender = users[(i * 3) % users.length];
    const collection = i % 2 === 0 ? 'messages-elite' : 'messages-growth-lab';
    batch.set(db.collection(collection).doc(), {
      senderId: sender.id,
      senderName: sender.displayName,
      content,
      type: 'text',
      timestamp: daysAgo(MESSAGES.length - i),
      readBy: [sender.id],
    });
  });

  await batch.commit();
  console.log(`Seeded ${users.length} members and ${MESSAGES.length} messages.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
