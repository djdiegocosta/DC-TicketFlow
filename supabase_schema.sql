-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- IMPORTANT: If the 'public.users' table already exists, you might need to
-- drop it and recreate it to apply the new foreign key constraint.
-- This will delete existing data in 'public.users'.
-- For example, use:
-- DROP TABLE IF EXISTS public.users CASCADE;
-- before running the CREATE TABLE statement below in your Supabase SQL editor.

-- Create users table (profile table linked to auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- Link to auth.users, deleting auth user cascades to profile
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'check' CHECK (role IN ('check', 'manager', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create events table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME NOT NULL,
    ticket_price NUMERIC(10,2) NOT NULL,
    -- Status aligned with new official standard: draft, published, closed
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    encerrado_em TIMESTAMP WITH TIME ZONE,
    box_office_sales NUMERIC(10,2) DEFAULT 0.00,
    online_sales NUMERIC(10,2) DEFAULT 0.00,
    infra_cost NUMERIC(10,2) DEFAULT 0.00,
    staff_cost NUMERIC(10,2) DEFAULT 0.00,
    event_other_expenses NUMERIC(10,2) DEFAULT 0.00,
    bar_sales NUMERIC(10,2) DEFAULT 0.00,
    bar_cost_beverages NUMERIC(10,2) DEFAULT 0.00,
    bar_cost_misc NUMERIC(10,2) DEFAULT 0.00,
    bar_other_expenses NUMERIC(10,2) DEFAULT 0.00,
    observations TEXT,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sales table
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    sale_code TEXT UNIQUE NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    number_of_tickets INTEGER NOT NULL,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_code TEXT UNIQUE NOT NULL,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    buyer_name TEXT NOT NULL,
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('normal', 'courtesy')),
    status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled')),
    checked_in_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create error_logs table
CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT,
    message TEXT NOT NULL,
    cause TEXT,
    solution TEXT NOT NULL,
    context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own data (except admins)
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all users" ON public.users FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- Admins can create user profiles (after auth.signUp)
CREATE POLICY "Admins can create users" ON public.users FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- Users can update their own profile, Admins can update any user profile
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update all users" ON public.users FOR UPDATE USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
-- Admins can delete users, but prevent self-deletion
CREATE POLICY "Admins can delete users" ON public.users FOR DELETE USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') AND id <> auth.uid());


-- Events, sales, tickets policies
-- Policies kept but note: event status semantics changed to draft/published/closed
CREATE POLICY "Users can view events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Users can create events" ON public.events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update events" ON public.events FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete events" ON public.events FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view sales" ON public.sales FOR SELECT USING (true);
CREATE POLICY "Users can create sales" ON public.sales FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view tickets" ON public.tickets FOR SELECT USING (true);
CREATE POLICY "Users can create tickets" ON public.tickets FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update tickets" ON public.tickets FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view error logs" ON public.error_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Users can create error logs" ON public.error_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);