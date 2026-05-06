import { useEffect, useState } from 'react';
import Nav from './components/Nav';
import Events from './views/Events';
import { loadDataset } from './lib/dataset';
import './App.css';

export default function App() {
  const [generatedAt, setGeneratedAt] = useState(null);
  useEffect(() => {
    loadDataset().then(d => setGeneratedAt(d.generated_at)).catch(() => {});
  }, []);
  return (
    <div className="app">
      <Nav generatedAt={generatedAt} />
      <main className="main">
        <Events />
      </main>
    </div>
  );
}
