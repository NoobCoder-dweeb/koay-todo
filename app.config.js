const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleIosClientIdSuffix = '.apps.googleusercontent.com';

if (
  googleIosClientId &&
  (!googleIosClientId.endsWith(googleIosClientIdSuffix) ||
    googleIosClientId.length === googleIosClientIdSuffix.length)
) {
  throw new Error(
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be an iOS OAuth client ID ending in .apps.googleusercontent.com.',
  );
}

const googleSignInPlugin = googleIosClientId
  ? [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: `com.googleusercontent.apps.${googleIosClientId.slice(
          0,
          -googleIosClientIdSuffix.length,
        )}`,
      },
    ]
  : null;

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(googleSignInPlugin ? [googleSignInPlugin] : []),
  ],
});
