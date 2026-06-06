import { Text, View } from 'react-native';
import { oneHeavyCompute, ONE_HEAVY_MARKER } from '../one-heavy';

export default function One() {
  return (
    <View>
      <Text>ONE_SCREEN_LOADED</Text>
      <Text>{ONE_HEAVY_MARKER}: {oneHeavyCompute(10)}</Text>
    </View>
  );
}
