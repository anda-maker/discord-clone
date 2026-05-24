import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware as any);

router.get('/:id', async (req: AuthRequest, res) => {
  const { data, error } = await supabase.from('channels').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// Create a new channel inside a server. Only owners/admins may add channels.
router.post('/', async (req: AuthRequest, res) => {
  const { server_id, name, type = 'text', category } = req.body;
  if (!server_id || !name) return res.status(400).json({ error: 'Missing server_id or name' });
  if (!['text', 'voice'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

  // Verify the caller is a member with manage rights on this server.
  const { data: membership } = await supabase
    .from('server_members')
    .select('role')
    .eq('server_id', server_id)
    .eq('user_id', req.user!.id)
    .maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this server' });
  if (!['owner', 'admin'].includes(membership.role)) {
    return res.status(403).json({ error: 'Only owners or admins can create channels' });
  }

  // Compute next position
  const { data: existing } = await supabase
    .from('channels')
    .select('position')
    .eq('server_id', server_id)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;

  // Normalize name (lowercase, hyphenated) for text channels — Discord convention.
  const cleanName = type === 'text'
    ? name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50)
    : name.trim().slice(0, 50);
  if (!cleanName) return res.status(400).json({ error: 'Invalid channel name' });

  const { data: channel, error } = await supabase.from('channels').insert({
    server_id,
    name: cleanName,
    type,
    position: nextPos,
    category: category || (type === 'voice' ? 'VOICE CHANNELS' : 'TEXT CHANNELS'),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(channel);
});

export default router;
