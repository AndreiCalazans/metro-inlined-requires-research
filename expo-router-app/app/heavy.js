import { Text, View } from 'react-native';
import { heavyScreenDep, HEAVY_SCREEN_DEP_MARKER } from '../heavy-screen-dep';

export default function Heavy() {
  return (
    <View>
      <Text>HEAVY_SCREEN_LOADED</Text>
      <Text>{HEAVY_SCREEN_DEP_MARKER}: {heavyScreenDep()}</Text>
    </View>
  );
}
