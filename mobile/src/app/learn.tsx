import { Redirect } from 'expo-router';

/** The Learn tab became My signs; old links and bookmarks go there. */
export default function LearnRedirect() {
  return <Redirect href="/my-signs" />;
}
