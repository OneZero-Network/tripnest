# TripNest

An offline-first trip workspace. The trip is the object; expenses, the shared fund,
foreign-cash wallets, and settlement all live inside it.

Local-first: React + Vite + IndexedDB, wrapped by Capacitor into an Android APK.
No login, no server, no network calls at runtime.

---

## Get the APK without installing Android Studio

1. Push this folder to a GitHub repo.
2. Go to **Actions** → **Build Android APK** → **Run workflow**.
3. When it's green, download the `tripnest-apk` artifact. `tripnest-debug-*.apk`
   installs directly on any Android phone (allow "install from unknown sources").

Tag a commit (`git tag v0.1.0 && git push --tags`) and the APK is attached to a
GitHub Release instead of expiring after 30 days.

The `android/` folder is **not** committed. Capacitor regenerates it in CI from
`capacitor.config.ts`, which keeps ~200 template files out of your history.

### Signed release builds (only needed for the Play Store)

```bash
keytool -genkey -v -keystore release.keystore -alias tripnest \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # paste into the secret below
```

Add repo secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The release step turns itself on.

## Develop locally

```bash
npm install
npm run dev        # browser, full app, instant reload
npm test           # financial engine tests
npm run typecheck
```

To build an APK on your own machine you need JDK 21 + Android SDK, then:

```bash
npm run build && npx cap add android && npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## Engine freeze

**TripNest Core Engine v1 is locked.** `ENGINE_VERSION = 1` in `src/core/engine.ts`.

Before any change to `src/core/{engine,money,activity}.ts`, ask one question:

> Can this be done without changing the financial engine?

**Yes → it's a UI/application-layer change.** Go ahead.
**No → it needs a design review before implementation**, because it touches
money that's already been recorded for real trips.

### Why closed trips don't just recompute

Every trip is stamped with the `engineVersion` active when it was created.
When a trip is **closed**, `closeTrip()` freezes its settlement — the exact
transfers, balances, and warnings at that moment — into
`trip.closedSettlement`. `getSettlement()` reads that frozen snapshot for a
closed trip, full stop, regardless of what `ENGINE_VERSION` becomes later.
Reopening a trip is the one explicit, human-initiated way back to live
computation; re-closing re-freezes under whatever version is running then.

This is what makes a rounding or wallet-logic change in a future engine
version safe to ship: it changes new trips, and any trip still open, but it
can never silently rewrite a settlement that already happened. Concretely,
`engine.test.ts`'s "engine versioning and freeze" tests assert that adding a
new expense to a *closed* trip's data does not change its frozen transfers —
that's the guarantee, exercised.

### Development order from here

1. Trip creation UI
2. Home / trip list
3. Dashboard
4. Activity screen polish
5. Money screen
6. Settlement screen
7. Reports
8. Insights
9. Settings
10. Android polish

Only step outside `src/core/` if a real bug is found in it.

## How the money works

**Every stored amount is an integer in minor units.** Paise, not rupees. Floats
never touch money. `src/core/money.ts` is the only place that converts.

**Splits never lose a paisa.** `splitEvenly` and `splitByWeights` use the
largest-remainder method, so the parts always sum to the whole exactly.

**One shared wallet per foreign currency.** If the fund buys 1,000 SAR for
₹23,500 and Adnan later buys 500 SAR for ₹12,000, both land in the same wallet
at a blended rate of ₹23.667/SAR. Every SAR expense is valued at what the cash
actually cost — not today's FX rate. Adnan's ₹12,000 is recorded as money he put
into the group pot, and comes back to him at settlement.

**The identity the engine guarantees:**

```
Σ(paid) − Σ(share)  ==  fundRemaining + Σ(walletRemainingInBase)  ==  pot
```

`settle()` checks this on every call and surfaces a warning rather than silently
absorbing drift. If you ever see that warning, it is a real bug — file it.

**Settlement output** is a list of transfers, with unspent cash treated as a
payer in its own right:

```
Trip Fund → Ayaz      ₹8,200
Adnan     → Ayaz      ₹1,450
```

No "you owe". No leaderboard. Balances are listed alphabetically, deliberately.

## Layout

```
src/core/       pure functions, zero I/O — money.ts, engine.ts, types.ts
src/core/engine.test.ts    14 tests incl. the SAR scenario
src/db/         Dexie schema, soft delete + undo log, export/import
src/screens/    Trips, Dashboard, Expenses, Money, Settle
src/ui/kit.tsx  Screen, Sheet, Field, More (progressive disclosure)
src/share.ts    the snapshot that replaces a "live dashboard"
```

`src/core/` has no imports from `src/db/` or React. That boundary is the point:
the part that's expensive to get wrong is testable without a browser.

---

## What is deliberately not here

**A live dashboard.** It needs a server, a trip identity, and sync — the three
things the one-operator model exists to avoid. `src/share.ts` generates a
snapshot you paste into the group chat instead. Build the real thing only after
you've decided to own a backend.

**Cloud backup.** Instead: manual export/import on the Trips screen. No account
means no recovery, so back up before you wipe the phone. Fixing this properly
means a server and an account.

**AI.** Deliberately deferred. Receipt scanning needs internet, which contradicts
offline-first, and there is nothing to assist with until people are entering
expenses daily.

**Multi-writer editing.** The next real feature is *expense requests*: a viewer
submits a line, the operator accepts or rejects. That keeps exactly one writer —
no merge conflicts, no permission matrix — while removing the operator's
data-entry bottleneck.

**Documents, checklists, timeline, reports.** Sections inside the existing trip
workspace when you get there, not new apps.
