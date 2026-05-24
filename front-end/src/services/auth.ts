// src/services/auth.ts
export type LoginResponse = {
  user_id: string;
  access_token: string;
  refresh_token?: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';

export async function login({ email, password }: LoginPayload): Promise<LoginResponse> {

  const body = JSON.stringify({ user_name: email, user_pass: password });

  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    // 修正①: バックエンドのエラーキー名 "error" に合わせる
    const errData = await res.json().catch(() => ({ error: 'ログインに失敗しました' }));
    throw new Error(errData.error || 'ログインに失敗しました');
  }

  // 修正②: バックエンドからは配列で返ってくるため、JSONをパースして最初の要素を取り出す
  const data = await res.json();
  
  return data[0] as LoginResponse;
}