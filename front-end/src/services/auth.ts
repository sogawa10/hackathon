export type LoginResponse = {
  user_id: string;
  access_token: string;
  refresh_token?: string;
};

export type SignupResponse = {
  user_id: string;
  access_token: string;
  refresh_token?: string;
};

export type AuthPayload = {
  user_name: string;
  user_pass: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function login({ user_name, user_pass }: AuthPayload): Promise<LoginResponse> {
  const body = JSON.stringify({ user_name, user_pass });

  const res = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'ログインに失敗しました' }));
    const message = (errData as any).error || (errData as any).message || 'ログインに失敗しました';
    throw new Error(message);
  }

  const json = await res.json().catch(() => []);
  const data = Array.isArray(json) ? json[0] : json;

  if (!data || !data.access_token) {
    throw new Error('無効なレスポンスです');
  }

  return data as LoginResponse;
}

export async function signup({ user_name, user_pass }: AuthPayload): Promise<SignupResponse> {
  const body = JSON.stringify({ user_name, user_pass });

  const res = await fetch(`${API_BASE_URL}/api/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'ユーザー登録に失敗しました' }));
    const message = (errData as any).error || (errData as any).message || 'ユーザー登録に失敗しました';
    throw new Error(message);
  }

  const json = await res.json().catch(() => []);
  const data = Array.isArray(json) ? json[0] : json;

  if (!data || !data.access_token) {
    throw new Error('無効なレスポンスです');
  }

  return data as SignupResponse;
}