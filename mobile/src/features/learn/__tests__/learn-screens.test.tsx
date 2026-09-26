import { fireEvent, screen } from '@testing-library/react-native';

import { getSign } from '@/content/library';
import type { SignEntry } from '@/content/types';
import type { QuizQuestion } from '@/learn/quiz';
import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';

import { CategoryScreen } from '../CategoryScreen';
import { LearnHomeScreen } from '../LearnHomeScreen';
import { LessonScreen } from '../LessonScreen';
import { QuizRunner } from '../QuizRunner';
import { QuizScreen } from '../QuizScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => {
  mockParams = {};
  Object.values(mockRouter).forEach((fn) => fn.mockReset());
});

describe('LearnHomeScreen', () => {
  it('lists every category with counts and states that content is being verified', async () => {
    renderWithProviders(<LearnHomeScreen />);
    expect(await screen.findByText(/prepared with qualified ISL educators/)).toBeOnTheScreen();
    for (const name of ['Greetings', 'Everyday', 'People', 'Food', 'Numbers', 'Places', 'Questions', 'Emergency', 'Common phrases']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}\\.`) })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: /^Numbers\. 11 signs · 0 learned$/ })).toBeOnTheScreen();
  });

  it('opens a category', async () => {
    renderWithProviders(<LearnHomeScreen />);
    fireEvent.press(await screen.findByTestId('category-food'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/learn/[category]', params: { category: 'food' } });
  });
});

describe('CategoryScreen', () => {
  it('shows lessons with their status and explains why the quiz is unavailable', async () => {
    mockParams = { category: 'greetings' };
    renderWithProviders(<CategoryScreen />);
    expect(await screen.findByTestId('lesson-hello')).toBeOnTheScreen();
    expect(screen.getAllByText('Demonstration coming soon').length).toBeGreaterThan(0);
    expect(screen.getByTestId('quiz-unavailable')).toBeOnTheScreen();
  });

  it('handles an unknown category', async () => {
    mockParams = { category: 'nope' };
    renderWithProviders(<CategoryScreen />);
    expect(await screen.findByText('Lesson not found')).toBeOnTheScreen();
  });
});

describe('LessonScreen', () => {
  it('shows the meaning, a placeholder demonstration and an unverified warning', async () => {
    mockParams = { id: 'thank_you' };
    renderWithProviders(<LessonScreen />);
    expect(await screen.findByTestId('lesson-screen-thank_you')).toBeOnTheScreen();
    expect(screen.getByTestId('demonstration-placeholder')).toBeOnTheScreen();
    expect(screen.getByText(/do not learn it from this app until it is verified/)).toBeOnTheScreen();
    expect(screen.getByText('Gloss: THANK-YOU')).toBeOnTheScreen();
  });

  it('does not let users mark unverified signs as learned or practise without a model', async () => {
    mockParams = { id: 'hello' };
    renderWithProviders(<LessonScreen />);
    expect(await screen.findByTestId('mark-learned')).toBeDisabled();
    expect(screen.getByTestId('practice')).toBeDisabled();
    expect(screen.getByText(/available when sign recognition is ready/)).toBeOnTheScreen();
  });

  it('does not invent sign order for phrases', async () => {
    mockParams = { id: 'how_are_you' };
    renderWithProviders(<LessonScreen />);
    expect(await screen.findByText(/sign order will come from ISL educators/)).toBeOnTheScreen();
  });

  it('moves to the next sign in the category', async () => {
    mockParams = { id: 'hello' };
    renderWithProviders(<LessonScreen />);
    fireEvent.press(await screen.findByTestId('next-lesson'));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/learn/sign/[id]', params: { id: 'goodbye' } });
  });

  it('shows the meaning in the output language as well when it differs', async () => {
    mockParams = { id: 'water' };
    const store = createMemoryStore({ 'islconnect.settings.v1': JSON.stringify({ outputLanguage: 'hi' }) });
    renderWithProviders(<LessonScreen />, { store });
    expect(await screen.findByText('हिन्दी: पानी')).toBeOnTheScreen();
  });
});

describe('QuizScreen', () => {
  it('is unavailable until verified demonstrations exist', async () => {
    mockParams = { category: 'food' };
    renderWithProviders(<QuizScreen />);
    expect(await screen.findByTestId('quiz-unavailable')).toBeOnTheScreen();
  });
});

describe('QuizRunner (with verified test fixtures)', () => {
  const ids = ['hello', 'thank_you', 'sorry', 'please'];
  const signs = new Map<string, SignEntry>(
    ids.map((id) => [
      id,
      {
        ...getSign(id)!,
        media: { kind: 'video', uri: `fixture://${id}`, license: 'test', consentRef: 'test' },
        verification: { status: 'verified', reviewedBy: 'fixture', source: 'fixture' },
      },
    ]),
  );
  const questions: QuizQuestion[] = [
    { signId: 'hello', optionIds: ['sorry', 'hello', 'please', 'thank_you'], answerIndex: 1 },
    { signId: 'please', optionIds: ['please', 'hello', 'sorry', 'thank_you'], answerIndex: 0 },
  ];

  it('checks answers, gives feedback, reports each answer and shows a result', async () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <QuizRunner questions={questions} signs={signs} language="en" onAnswer={onAnswer} onRestart={jest.fn()} />,
    );

    expect(await screen.findByText('Question 1 of 2')).toBeOnTheScreen();
    expect(screen.getByTestId('quiz-check')).toBeDisabled();
    fireEvent.press(screen.getByRole('radio', { name: 'Hello' }));
    fireEvent.press(screen.getByTestId('quiz-check'));
    expect(screen.getByText('Correct!')).toBeOnTheScreen();
    expect(onAnswer).toHaveBeenLastCalledWith('hello', true);

    fireEvent.press(screen.getByRole('button', { name: 'Next question' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Sorry' }));
    fireEvent.press(screen.getByTestId('quiz-check'));
    expect(screen.getByText('Not quite. This sign means: Please')).toBeOnTheScreen();
    expect(onAnswer).toHaveBeenLastCalledWith('please', false);

    fireEvent.press(screen.getByRole('button', { name: 'See result' }));
    expect(screen.getByText('You got 1 of 2 right')).toBeOnTheScreen();
  });
});
