import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../Button';
import { Notice } from '../Notice';
import { RadioGroup } from '../RadioGroup';
import { StateView } from '../StateView';
import { SwitchRow } from '../SwitchRow';

describe('Button', () => {
  it('exposes role, label and hint', () => {
    const onPress = jest.fn();
    render(<Button label="Speak" accessibilityHint="Reads the text aloud" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Speak' });
    expect(button.props.accessibilityHint).toBe('Reads the text aloud');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire and reports disabled state when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Speak" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Speak' });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports busy state', () => {
    render(<Button label="Saving" busy onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Saving' })).toBeBusy();
  });
});

describe('Notice', () => {
  it('uses the alert role for warnings so they are announced', () => {
    render(<Notice tone="warning" title="Careful" message="Low light" />);
    expect(screen.getByRole('alert', { name: 'Careful. Low light' })).toBeOnTheScreen();
  });

  it('shows text for information, not colour alone', () => {
    render(<Notice tone="info" message="Camera stays on this phone" />);
    expect(screen.getByText('Camera stays on this phone')).toBeOnTheScreen();
  });
});

describe('StateView', () => {
  it('renders title, message and a recovery action', () => {
    const onPress = jest.fn();
    render(<StateView title="No camera" message="This phone has no camera" action={{ label: 'Go home', onPress }} />);
    expect(screen.getByLabelText('No camera. This phone has no camera')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Go home' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('RadioGroup', () => {
  it('marks the selected option and reports changes', () => {
    const onChange = jest.fn();
    render(
      <RadioGroup
        label="Speed"
        value="normal"
        onChange={onChange}
        options={[
          { value: 'slow', label: 'Slow' },
          { value: 'normal', label: 'Normal' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Slow' })).not.toBeChecked();
    fireEvent.press(screen.getByRole('radio', { name: 'Slow' }));
    expect(onChange).toHaveBeenCalledWith('slow');
  });
});

describe('SwitchRow', () => {
  it('toggles when the whole row is pressed', () => {
    const onValueChange = jest.fn();
    render(<SwitchRow label="Save history" value={false} onValueChange={onValueChange} />);
    const row = screen.getByRole('switch', { name: 'Save history' });
    expect(row).not.toBeChecked();
    fireEvent.press(row);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
