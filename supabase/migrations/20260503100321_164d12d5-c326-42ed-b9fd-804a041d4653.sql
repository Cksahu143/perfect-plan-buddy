CREATE TABLE public.video_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID,
  prompt TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  style TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  final_video_url TEXT,
  error TEXT,
  scenes_total INTEGER DEFAULT 0,
  scenes_done INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select video_jobs" ON public.video_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert video_jobs" ON public.video_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update video_jobs" ON public.video_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete video_jobs" ON public.video_jobs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_video_jobs_status ON public.video_jobs(status);
CREATE INDEX idx_video_jobs_user ON public.video_jobs(user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.video_jobs;
ALTER TABLE public.video_jobs REPLICA IDENTITY FULL;