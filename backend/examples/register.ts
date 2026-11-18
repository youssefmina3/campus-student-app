export async function register(input: {
  full_name: string; email: string; password: string;
}) {
  const response = await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not register.');
  return result.user;
}
