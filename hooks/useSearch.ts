import { useState, useEffect } from 'react';
import { Message } from '../types';
import { searchMessages } from '../services/chat';

interface UseSearchOptions {
  messages: Message[];
}

export function useSearch({ messages }: UseSearchOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Handle search with debouncing
  useEffect(() => {
    if (!searchQuery.trim()) {
      // Defensive: only update if not already empty. Setting a fresh `[]`
      // every run (combined with an unstable `messages` dep) would re-render
      // endlessly — React #185. Bail out by reusing the previous reference.
      setSearchResults((prev) => (prev.length === 0 ? prev : []));
      setIsSearching((prev) => (prev ? false : prev));
      return;
    }

    setIsSearching(true);
    const debounceTimer = setTimeout(() => {
      const results = searchMessages(messages, searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, messages]);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
  };
}
