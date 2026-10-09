import { Redirect } from 'expo-router';

/** My signs moved into the tabs; old links to /signs go there. */
export default function SignsRedirect() {
  return <Redirect href="/my-signs" />;
}
