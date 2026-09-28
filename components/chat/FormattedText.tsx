import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';

export interface FormattedTextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

interface FormattedTextProps {
  content: string;
  formattedContent?: FormattedTextSegment[];
  style?: TextStyle;
}

/**
 * Parse markdown-style text formatting
 * Supports: **bold**, *italic*, ~~strikethrough~~, `code`
 */
export function parseTextFormatting(text: string): FormattedTextSegment[] {
  const segments: FormattedTextSegment[] = [];
  let currentText = '';
  let i = 0;

  while (i < text.length) {
    // Check for bold **text**
    if (text[i] === '*' && text[i + 1] === '*') {
      if (currentText) {
        segments.push({ text: currentText });
        currentText = '';
      }
      i += 2;
      let boldText = '';
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '*')) {
        boldText += text[i];
        i++;
      }
      if (boldText) {
        segments.push({ text: boldText, bold: true });
      }
      i += 2;
      continue;
    }

    // Check for italic *text*
    if (text[i] === '*' && text[i + 1] !== '*') {
      if (currentText) {
        segments.push({ text: currentText });
        currentText = '';
      }
      i += 1;
      let italicText = '';
      while (i < text.length && text[i] !== '*') {
        italicText += text[i];
        i++;
      }
      if (italicText) {
        segments.push({ text: italicText, italic: true });
      }
      i += 1;
      continue;
    }

    // Check for strikethrough ~~text~~
    if (text[i] === '~' && text[i + 1] === '~') {
      if (currentText) {
        segments.push({ text: currentText });
        currentText = '';
      }
      i += 2;
      let strikeText = '';
      while (i < text.length - 1 && !(text[i] === '~' && text[i + 1] === '~')) {
        strikeText += text[i];
        i++;
      }
      if (strikeText) {
        segments.push({ text: strikeText, strike: true });
      }
      i += 2;
      continue;
    }

    // Check for code `text`
    if (text[i] === '`') {
      if (currentText) {
        segments.push({ text: currentText });
        currentText = '';
      }
      i += 1;
      let codeText = '';
      while (i < text.length && text[i] !== '`') {
        codeText += text[i];
        i++;
      }
      if (codeText) {
        segments.push({ text: codeText, code: true });
      }
      i += 1;
      continue;
    }

    // Regular character
    currentText += text[i];
    i++;
  }

  // Add remaining text
  if (currentText) {
    segments.push({ text: currentText });
  }

  return segments;
}

/**
 * Render text with formatting
 */
export function FormattedText({ content, formattedContent, style }: FormattedTextProps) {
  const segments = formattedContent || parseTextFormatting(content);

  return (
    <Text style={style}>
      {segments.map((segment, index) => {
        const segmentStyle: TextStyle = {};

        if (segment.bold) {
          segmentStyle.fontWeight = '700';
        }

        if (segment.italic) {
          segmentStyle.fontStyle = 'italic';
        }

        if (segment.strike) {
          segmentStyle.textDecorationLine = 'line-through';
        }

        if (segment.code) {
          segmentStyle.fontFamily = 'Courier';
          segmentStyle.backgroundColor = 'rgba(0, 0, 0, 0.1)';
          segmentStyle.paddingHorizontal = 4;
          segmentStyle.paddingVertical = 2;
          segmentStyle.borderRadius = 3;
        }

        return (
          <Text key={index} style={segmentStyle}>
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Format toolbar button
 */
export function getFormattingButtons() {
  return [
    { id: 'bold', label: 'B', style: { fontWeight: '700' }, syntax: '**' },
    { id: 'italic', label: 'I', style: { fontStyle: 'italic' }, syntax: '*' },
    { id: 'strike', label: 'S', style: { textDecorationLine: 'line-through' }, syntax: '~~' },
    { id: 'code', label: '</>', style: { fontFamily: 'Courier' }, syntax: '`' },
  ];
}

/**
 * Apply formatting to selected text or insert at cursor
 */
export function applyFormatting(
  text: string,
  selection: { start: number; end: number },
  formatSyntax: string
): { text: string; selection: { start: number; end: number } } {
  const { start, end } = selection;
  const hasSelection = start !== end;

  if (hasSelection) {
    // Wrap selected text with syntax
    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);

    const newText = `${before}${formatSyntax}${selected}${formatSyntax}${after}`;
    const syntaxLength = formatSyntax.length;

    return {
      text: newText,
      selection: {
        start: start + syntaxLength,
        end: end + syntaxLength,
      },
    };
  } else {
    // Insert syntax at cursor position
    const before = text.substring(0, start);
    const after = text.substring(start);

    const newText = `${before}${formatSyntax}${formatSyntax}${after}`;
    const syntaxLength = formatSyntax.length;

    return {
      text: newText,
      selection: {
        start: start + syntaxLength,
        end: start + syntaxLength,
      },
    };
  }
}
