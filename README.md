# Family Todo

Cross-platform Expo app for a single shared family todo list. It supports Apple and Google sign-in, invitation codes, todo assignment, realtime updates, and local-first editing with a persisted retry queue.

## Run

1. Create a Firebase project and register an iOS and Android app.
2. Enable Google and Apple in Firebase Authentication. Configure the platform OAuth client IDs and the Apple provider credentials in Firebase.
3. Copy `.env.example` to `.env` and add the Firebase client configuration plus Google OAuth client IDs. These are client configuration values, not Admin credentials.
4. Deploy `firestore.rules` to the project's Cloud Firestore database.
5. Install dependencies with `npm install`, then start Expo with `npm start`.

Apple sign-in requires an Apple-enabled iOS app identifier and a native development build. Configure the Apple provider's team, key, and service ID in Firebase Authentication. Google sign-in requires platform OAuth client IDs and the Android app's signing certificate registered with Google. The app displays setup guidance when Firebase configuration is missing.

Before distributing the app, replace the example iOS bundle identifier and Android package in `app.json` with identifiers owned by your organization.

Firestore security rules restrict family data to signed-in members, make invite lookup get-only, and prevent family membership from exceeding five members. Never add Firebase Admin credentials to the app.

## Development

- `npm test` runs the domain and local/offline synchronization tests.
- `npm run typecheck` checks the TypeScript project.
- `npm run ios` and `npm run android` launch the corresponding Expo development target.
