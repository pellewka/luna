import { Platform } from 'react-native';
export const colors = {
  background: '#FAF9F7',
  white: '#FFFFFF',
  ink: '#302D3B',
  muted: '#797582',
  purple: '#786590',
  purpleDark: '#66517E',
  lavender: '#EDE6F4',
  lilac: '#F3EEF7',
  rose: '#F9E5E7',
  roseDark: '#B9647A',
  green: '#E6F0E9',
  greenDark: '#487962',
  amber: '#FCF0D9',
  amberDark: '#946B25',
  red: '#F9E3E0',
  redDark: '#AF5454',
  blue: '#E7EFF5',
  blueDark: '#527896',
  line: '#ECE9EE',
};
export const serif = Platform.select({ ios: 'Georgia', default: 'serif' });
