import { createContext, useState } from 'react';

export type User = {
  id: string;
  username: string;
  email?: string;
};

type AuthContextValue = {
  currentUser: User;
  setCurrentUser: (u: User) => void;
  users: User[];
  addUser: (username: string, email?: string) => User;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: any) => {
  const storedEmail = localStorage.getItem('userEmail') || undefined;
  const initialUsers: User[] = [
    {
      id: 'demo-user',
      username: 'Demo User',
      email: storedEmail,
    },
  ];

  const [users, setUsers] = useState<User[]>(initialUsers);
  const [currentUser, setCurrentUserState] = useState<User>(initialUsers[0]);

  const setCurrentUser = (user: User) => {
    setCurrentUserState(user);
    setUsers((prev) =>
      prev.map((existing) => (existing.id === user.id ? { ...existing, ...user } : existing)),
    );
    if (user.email) {
      localStorage.setItem('userEmail', user.email);
    }
  };

  const addUser = (username: string, email?: string) => {
    const id = `u-${Date.now()}`;
    const newUser: User = { id, username, email };
    setUsers((prev) => [...prev, newUser]);
    setCurrentUser(newUser);
    return newUser;
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, users, addUser }}>{children}</AuthContext.Provider>
  );
};
