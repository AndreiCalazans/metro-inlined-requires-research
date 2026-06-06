import React, { useState } from 'react';
import { Text, View, Button } from 'react-native';

// Top-level imports of modules used only inside event handlers / branches.
// These are the prime candidates for the inline-requires transform.
import { heavyCompute, HEAVY_TAG } from './heavy';
import { formatRare } from './rarely-used';

export default function App() {
  const [output, setOutput] = useState('idle');

  const runHeavy = () => {
    // First reference to heavyCompute / HEAVY_TAG happens here.
    const result = heavyCompute(1000);
    setOutput(`${HEAVY_TAG}: ${result.toFixed(2)}`);
  };

  const runRare = () => {
    // First reference to formatRare happens here.
    setOutput(formatRare('inlined requires'));
  };

  const runLazy = async () => {
    // Dynamic import: the deferral pattern for splitting JS work off startup.
    const { lazyGreeting } = await import('./lazy');
    setOutput(lazyGreeting());
  };

  return (
    <View>
      <Text>Metro Inlined Requires Demo</Text>
      <Text>{output}</Text>
      <Button title="Run heavy" onPress={runHeavy} />
      <Button title="Run rare" onPress={runRare} />
      <Button title="Run lazy" onPress={runLazy} />
    </View>
  );
}
