import { Text, View } from 'react-native';
import { Link } from 'expo-router';

export const HOME_SCREEN_MARKER = 'HOME_SCREEN_LOADED';

export default function Home() {
  return (
    <View>
      <Text>{HOME_SCREEN_MARKER}</Text>
      <Link href="/one">Go to one</Link>
      <Link href="/two">Go to two</Link>
      <Link href="/heavy">Go to heavy</Link>
    </View>
  );
}
