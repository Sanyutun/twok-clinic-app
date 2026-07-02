/**
 * SupabaseClient - Frontend Supabase integration
 * Handles direct Supabase operations and realtime subscriptions
 */

class SupabaseClient {
    constructor() {
        this.client = null;
        this.subscriptions = new Map();
        this.initialized = false;
        this.initializing = false;
        this.initPromise = null;
    }

    /**
     * Initialize Supabase client
     * @param {string} url - Supabase project URL
     * @param {string} key - Supabase anon key
     */
    async init(url, key) {
        if (this.initialized) {
            return;
        }

        if (this.initializing) {
            TWOK_LOGGER.realtime('[SupabaseClient] Initialization already in progress, waiting...');
            return this.initPromise;
        }

        this.initializing = true;
        this.initPromise = (async () => {
            try {
                TWOK_LOGGER.realtime('[SupabaseClient] Starting initialization...');
                
                if (!url || !key) {
                    throw new Error('Supabase URL or Key is missing');
                }

                // Dynamically import Supabase JS client - try multiple CDN sources
                // to handle mobile browsers where certain CDNs may be blocked
                const { createClient } = await this._importSupabase();
                
                this.client = createClient(url, key, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true
                    }
                });

                if (!this.client) {
                    throw new Error('Failed to create Supabase client');
                }

                this.initialized = true;
                this.initializing = false;
                TWOK_LOGGER.realtime('[SupabaseClient] ✅ Initialized successfully');
            } catch (error) {
                this.initializing = false;
                this.initialized = false;
                console.error('[SupabaseClient] ❌ Failed to initialize:', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * Try to import @supabase/supabase-js from multiple CDN sources
     * Falls back through multiple providers for mobile compatibility
     */
    async _importSupabase() {
        // Try UMD script tag first — <script> tags work through more firewalls/proxies
        // than dynamic import() and don't have CORS module restrictions.
        try {
            TWOK_LOGGER.realtime('[SupabaseClient] Trying UMD script tag (most compatible)...');
            const { createClient } = await this._loadSupabaseScript();
            return { createClient };
        } catch (e) {
            console.warn('[SupabaseClient] UMD script tag failed:', e.message);
        }

        // Older Android WebViews may not support dynamic import() at all
        const supportsDynamicImport = (() => { try { return typeof import('data:text/javascript,') === 'object'; } catch(e) { return false; } })();
        if (!supportsDynamicImport) {
            throw new Error('Dynamic import not supported and UMD fallback already failed');
        }

        const cdnSources = [
            {
                name: 'unpkg (module)',
                url: 'https://unpkg.com/@supabase/supabase-js@2.39.7/dist/module/index.js'
            },
            {
                name: 'esm.sh',
                url: 'https://esm.sh/@supabase/supabase-js@2.39.7'
            },
            {
                name: 'jsdelivr (module)',
                url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/module/index.js'
            },
            {
                name: 'jsdelivr (+esm)',
                url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/+esm'
            }
        ];

        let lastError;

        for (const source of cdnSources) {
            try {
                TWOK_LOGGER.realtime(`[SupabaseClient] Trying CDN: ${source.name} (${source.url})`);
                const mod = await import(source.url);
                TWOK_LOGGER.realtime(`[SupabaseClient] ✅ Loaded from CDN: ${source.name}`);
                return mod;
            } catch (e) {
                lastError = e;
                console.warn(`[SupabaseClient] CDN source "${source.name}" failed:`, e.message);
            }
        }

        throw lastError || new Error('Failed to load Supabase client from any CDN source. Please check your internet connection.');
    }

    /**
     * Load Supabase via dynamic script tag injection (UMD build)
     * Used as last resort when dynamic imports fail on some mobile browsers
     */
    _loadSupabaseScript() {
        const umdSources = [
            'https://unpkg.com/@supabase/supabase-js@2.39.7/dist/umd/supabase.js',
            'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.js'
        ];

        const tryLoad = (index) => {
            return new Promise((resolve, reject) => {
                if (index >= umdSources.length) {
                    reject(new Error('All UMD sources failed'));
                    return;
                }
                const script = document.createElement('script');
                script.src = umdSources[index];
                script.crossOrigin = 'anonymous';
                script.onload = () => {
                    if (window.supabase && typeof window.supabase.createClient === 'function') {
                        resolve(window.supabase);
                    } else {
                        reject(new Error('UMD script loaded but createClient not found'));
                    }
                };
                script.onerror = () => {
                    TWOK_LOGGER.realtime(`[SupabaseClient] UMD source failed: ${umdSources[index]}`);
                    tryLoad(index + 1).then(resolve, reject);
                };
                document.head.appendChild(script);
            });
        };

        return tryLoad(0);
    }

    /**
     * Internal helper to ensure client is ready
     */
    checkInitialized() {
        if (!this.initialized || !this.client) {
            throw new Error('Supabase client not initialized. Call init() first.');
        }
    }

    // ==========================================
    // CRUD OPERATIONS
    // ==========================================
    
    /**
     * Fetch all records from a table
     * @param {string} table - Table name
     * @param {Object} options - { orderBy, orderDir, filters }
     * @returns {Promise<Array>}
     */
    async getAll(table, options = {}) {
        this.checkInitialized();
        const { orderBy = 'created_at', orderDir = 'asc', filters = [] } = options;

        let query = this.client.from(table).select('*');

        // Apply filters
        filters.forEach(filter => {
            query = query[filter.operator](filter.column, filter.value);
        });

        // Apply ordering
        if (orderBy) {
            query = query.order(orderBy, { ascending: orderDir === 'asc' });
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    /**
     * Get a single record by ID
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @returns {Promise<Object>}
     */
    async getById(table, id) {
        this.checkInitialized();
        const { data, error } = await this.client
            .from(table)
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Insert a new record
     * @param {string} table - Table name
     * @param {Object} data - Record data
     * @returns {Promise<Object>}
     */
    async insert(table, data) {
        this.checkInitialized();
        const { data: result, error } = await this.client
            .from(table)
            .insert(data)
            .select()
            .single();

        if (error) throw error;
        return result;
    }

    /**
     * Update a record
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @param {Object} data - Updated data
     * @returns {Promise<Object>}
     */
    async update(table, id, data) {
        this.checkInitialized();
        const { data: result, error } = await this.client
            .from(table)
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return result;
    }

    /**
     * Delete a record
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @returns {Promise<boolean>}
     */
    async delete(table, id) {
        this.checkInitialized();
        const { error } = await this.client
            .from(table)
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    }

    /**
     * Bulk insert records
     * @param {string} table - Table name
     * @param {Array<Object>} records - Array of record data
     * @returns {Promise<Array>}
     */
    async bulkInsert(table, records) {
        this.checkInitialized();
        const { data, error } = await this.client
            .from(table)
            .insert(records)
            .select();

        if (error) throw error;
        return data;
    }

    /**
     * Bulk update records
     * @param {string} table - Table name
     * @param {string} idColumn - ID column name
     * @param {Array<Object>} updates - Array of { id, ...data }
     */
    async bulkUpdate(table, idColumn, updates) {
        this.checkInitialized();
        const results = [];
        // ... rest of method ...
        
        for (const update of updates) {
            const { id, ...data } = update;
            const result = await this.update(table, id, data);
            results.push(result);
        }

        return results;
    }

    // ==========================================
    // REALTIME SUBSCRIPTIONS
    // ==========================================
    
    /**
     * Subscribe to table changes
     * @param {string} table - Table name
     * @param {Function} callback - (eventType, record) => void
     * @param {Object} options - { events: ['INSERT', 'UPDATE', 'DELETE'] }
     * @returns {string|null} subscriptionId
     */
    async subscribe(table, callback, options = {}) {
        if (!navigator.onLine) {
            TWOK_LOGGER.realtime(`[SupabaseClient] 📴 Offline: skipping subscription for ${table}`);
            return null;
        }

        this.checkInitialized();
        const { events = ['INSERT', 'UPDATE', 'DELETE'] } = options;

        const channelName = `${table}-${Date.now()}`;
        
        const channel = this.client.channel(channelName);

        events.forEach(event => {
            channel.on(
                'postgres_changes',
                {
                    event,
                    schema: 'public',
                    table
                },
                (payload) => {
                    TWOK_LOGGER.realtime(`[SupabaseClient] 📡 ${table} ${event}:`, payload.new || payload.old);
                    callback(event.toLowerCase(), payload.new || payload.old);
                }
            );
        });

        const subscription = await channel.subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                TWOK_LOGGER.realtime(`[SupabaseClient] ✅ Subscribed to ${table}`);
            } else if (status === 'CHANNEL_ERROR') {
                // Only log if still online to reduce noise
                if (navigator.onLine) {
                   // const errMsg = err ?? 'No error details provided (check Realtime is enabled for this table in Supabase dashboard, and that RLS policies allow SELECT)';
                   // console.error(`[SupabaseClient] ❌ Channel error for ${table}:`, errMsg);
                }
            } else if (status === 'TIMED_OUT') {
                if (navigator.onLine) {
                    console.warn(`[SupabaseClient] ⚠️ Subscription timed out for ${table}`);
                }
            } else {
                TWOK_LOGGER.realtime(`[SupabaseClient] Subscription status for ${table}:`, status);
            }
        });

        this.subscriptions.set(channelName, { channel, table, callback });
        return channelName;
    }

    /**
     * Unsubscribe from a channel
     * @param {string} subscriptionId - Channel name
     */
    async unsubscribe(subscriptionId) {
        this.checkInitialized();
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription) {
            await this.client.removeChannel(subscription.channel);
            this.subscriptions.delete(subscriptionId);
            TWOK_LOGGER.realtime(`[SupabaseClient] ❌ Unsubscribed from ${subscription.table}`);
        }
    }

    /**
     * Unsubscribe from all channels
     */
    async unsubscribeAll() {
        const promises = Array.from(this.subscriptions.keys()).map(id => this.unsubscribe(id));
        await Promise.all(promises);
        this.subscriptions.clear();
        TWOK_LOGGER.realtime('[SupabaseClient] ❌ Unsubscribed from all channels');
    }

    // ==========================================
    // QUERY HELPERS
    // ==========================================
    
    /**
     * Query records with filters
     * @param {string} table - Table name
     * @param {Object} filters - { column: { operator, value } }
     * @returns {Promise<Array>}
     */
    async query(table, filters = {}) {
        this.checkInitialized();
        // Use a high limit to ensure we get all records for offline-first sync
        let query = this.client.from(table).select('*').limit(5000);

        Object.entries(filters).forEach(([column, filter]) => {
            if (filter.operator === 'in') {
                query = query.in(column, filter.value);
            } else if (filter.operator === 'like') {
                query = query.like(column, filter.value);
            } else if (filter.operator === 'gte') {
                query = query.gte(column, filter.value);
            } else if (filter.operator === 'gt') {
                query = query.gt(column, filter.value);
            } else if (filter.operator === 'lte') {
                query = query.lte(column, filter.value);
            } else if (filter.operator === 'eq') {
                query = query.eq(column, filter.value);
            } else {
                query = query[filter.operator](column, filter.value);
            }
        });

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    /**
     * Get record count
     * @param {string} table - Table name
     * @param {Object} filters - Optional filters
     * @returns {Promise<number>}
     */
    async count(table, filters = {}) {
        this.checkInitialized();
        let query = this.client.from(table).select('*', { count: 'exact', head: true });

        Object.entries(filters).forEach(([column, filter]) => {
            query = query[filter.operator](column, filter.value);
        });

        const { count, error } = await query;
        if (error) throw error;
        return count;
    }

    // ==========================================
    // AUTHENTICATION (Optional)
    // ==========================================
    
    /**
     * Sign in with email/password
     * @param {string} email 
     * @param {string} password 
     */
    async signIn(email, password) {
        this.checkInitialized();
        const { data, error } = await this.client.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    }

    /**
     * Sign up with email/password
     * @param {string} email 
     * @param {string} password 
     */
    async signUp(email, password) {
        this.checkInitialized();
        const { data, error } = await this.client.auth.signUp({
            email,
            password
        });

        if (error) throw error;
        return data;
    }

    /**
     * Sign out
     */
    async signOut() {
        this.checkInitialized();
        const { error } = await this.client.auth.signOut();
        if (error) throw error;
    }

    /**
     * Get current user
     * @returns {Object|null}
     */
    getCurrentUser() {
        if (!this.client) return null;
        return this.client.auth.getSession();
    }

    // ==========================================
    // STATUS
    // ==========================================
    
    getStatus() {
        return {
            initialized: this.initialized,
            subscriptions: Array.from(this.subscriptions.keys()).length,
            subscriptionList: Array.from(this.subscriptions.keys())
        };
    }
}

// Export as singleton
window.SupabaseClient = new SupabaseClient();
