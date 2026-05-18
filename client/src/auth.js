import { Amplify } from "aws-amplify";
import { signIn, signOut, fetchAuthSession } from "aws-amplify/auth";

export const isCognito = process.env.REACT_APP_AUTH_MODE === "cognito";

if (isCognito) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: process.env.REACT_APP_USER_POOL_ID,
        userPoolClientId: process.env.REACT_APP_CLIENT_ID,
      },
    },
  });
}

export const getToken = async () => {
  if (isCognito) {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString();
  }
  return localStorage.getItem("token");
};

export const cognitoLogin = async (username, password) => {
  try {
    await signOut();
  } catch (_) {}
  await signIn({ username, password, options: { authFlowType: "USER_PASSWORD_AUTH" } });
  const session = await fetchAuthSession();
  const claims = session.tokens?.idToken?.payload;
  return {
    id: claims?.sub,
    user_name: claims?.["cognito:username"],
  };
};

export const cognitoLogout = async () => {
  await signOut();
};
