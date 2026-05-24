import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // 1. Create the auth user via the service-role admin API (auto-confirms email).
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr || !created.user) {
    return res.status(400).json({ error: createErr?.message || 'Could not create user' });
  }
  const userId = created.user.id;

  // 2. Create the profile row using the service-role client (bypasses RLS).
  //    This MUST succeed before we return — otherwise the user would exist in
  //    auth.users with no profile, breaking FK references like servers.owner_id.
  const discriminator = Math.floor(1000 + Math.random() * 9000).toString();
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: userId,
    username,
    discriminator,
    avatar_url: null,
    status: 'online',
  });
  if (profileErr) {
    // Roll back the auth user so the next /register attempt can re-use the email.
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    return res.status(500).json({ error: `Failed to create profile: ${profileErr.message}` });
  }

  // 3. Sign the user in immediately so the client gets a session back.
  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return res.status(400).json({ error: signInErr.message });
  }

  res.json({ user: signIn.user, session: signIn.session });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });

  // Self-heal: if this user somehow lacks a profile row (e.g. legacy account
  // created before the FK-safe register flow), create one before returning.
  if (data.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!profile) {
      const username =
        (data.user.user_metadata?.username as string | undefined) ||
        data.user.email?.split('@')[0] ||
        'user';
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username,
        discriminator: Math.floor(1000 + Math.random() * 9000).toString(),
        avatar_url: null,
        status: 'online',
      });
    }
  }

  res.json({ user: data.user, session: data.session });
});

router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) await supabase.auth.admin.signOut(token);
  res.json({ success: true });
});

export default router;
