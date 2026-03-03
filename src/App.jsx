import { useState } from 'react';
import './index.css';
import StartScreen from './components/StartScreen';
import QuizScreen from './components/QuizScreen';
import ResultScreen from './components/ResultScreen';
import LoadingScreen from './components/LoadingScreen';
import Starfield from './components/Starfield';
import { fetchQuestions, submitAnswers } from './services/api';
import { QUESTION_COUNT, PASS_THRESHOLD } from './config';

// Game states: start | loading | quiz | submitting | result
export default function App() {
  const [gameState, setGameState] = useState('start');
  const [playerId, setPlayerId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleStart = async (id) => {
    setPlayerId(id);
    setError('');
    setGameState('loading');

    try {
      const qs = await fetchQuestions(QUESTION_COUNT);
      setQuestions(qs);
      setAnswers([]);
      setGameState('quiz');
    } catch (err) {
      console.error(err);
      setError('Failed to load questions. Please try again.');
      setGameState('start');
    }
  };

  const handleQuizComplete = async (playerAnswers) => {
    setAnswers(playerAnswers);
    setGameState('submitting');

    try {
      const res = await submitAnswers(playerId, playerAnswers);
      setResult(res);
      setGameState('result');
    } catch (err) {
      console.error(err);
      setError('Failed to submit answers. Please try again.');
      setGameState('start');
    }
  };

  const handleRestart = () => {
    setGameState('start');
    setQuestions([]);
    setAnswers([]);
    setResult(null);
    setError('');
  };

  return (
    <>
      <Starfield />

      {gameState === 'start' && (
        <StartScreen onStart={handleStart} error={error} />
      )}

      {gameState === 'loading' && (
        <LoadingScreen message="LOADING QUEST..." />
      )}

      {gameState === 'quiz' && (
        <QuizScreen
          questions={questions}
          onComplete={handleQuizComplete}
        />
      )}

      {gameState === 'submitting' && (
        <LoadingScreen message="CALCULATING SCORE..." />
      )}

      {gameState === 'result' && result && (
        <ResultScreen
          result={result}
          questions={questions}
          answers={answers}
          threshold={PASS_THRESHOLD}
          onRestart={handleRestart}
        />
      )}
    </>
  );
}
