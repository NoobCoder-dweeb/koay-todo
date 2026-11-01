# Family Todo

Cross-platform Expo app for a single shared family todo list. It supports Apple and Google sign-in, invitation codes, todo assignment, realtime updates, and local-first editing with a persisted retry queue.

## Run

1. Create a Firebase project and register an iOS and Android app.
2. Enable Google and Apple in Firebase Authentication. For Google, create an iOS OAuth client for the app's bundle ID, an Android OAuth client for the package name and signing SHA-1, and a Web OAuth client. Add the Android signing SHA-1 to the Firebase Android app settings too, and use the Web client ID in Firebase's Google provider configuration. Configure the Apple provider credentials in Firebase.
3. Copy `.env.example` to `.env` and add the Firebase client configuration, Google iOS client ID, and Google Web client ID. These are client configuration values, not Admin credentials.
4. Deploy `firestore.rules` to the project's Cloud Firestore database.
5. Install dependencies with `npm install`, then start Expo with `npm start`.

Google sign-in uses a native module and is unavailable in Expo Go. Its iOS callback URL scheme is derived from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` by `app.config.js`. Build and install the development client before testing Google sign-in:

```sh
npx eas-cli@latest build --platform android --profile development
# or
npx eas-cli@latest build --platform ios --profile development
```

For Android, the signing SHA-1 registered with Google and Firebase must match the EAS development keystore. After EAS creates it, find its fingerprint with `npx eas-cli@latest credentials --platform android`, register that SHA-1, and rebuild. Set the public environment variables in the matching EAS environment before cloud builds; the local `.env` file is not uploaded to EAS. After installing the development build, run `npm start` and open the project in that app, not Expo Go. Rebuild the native app after changing OAuth client IDs or native configuration.

Apple sign-in requires an Apple-enabled iOS app identifier and a native development build. Configure the Apple provider's team, key, and service ID in Firebase Authentication. The app displays setup guidance when Firebase configuration is missing.

Before distributing the app, replace the example iOS bundle identifier and Android package in `app.json` with identifiers owned by your organization.

Firestore security rules restrict family data to signed-in members, make invite lookup get-only, and prevent family membership from exceeding five members. Never add Firebase Admin credentials to the app.

## Development

- `npm test` runs the domain and local/offline synchronization tests.
- `npm run typecheck` checks the TypeScript project.
- `npm run ios` and `npm run android` launch the corresponding Expo development target.
