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
            console.log('[SupabaseClient] Initialization already in progress, waiting...');
            return this.initPromise;
        }

        this.initializing = true;
        this.initPromise = (async () => {
            try {
                console.log('[SupabaseClient] Starting initialization...');
                
                if (!url || !key) {
                    throw new Error('Supabase URL or Key is missing');
                }

                // Dynamically import Supabase JS client - Use a specific version for stability
                const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/+esm');
                
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
                console.log('[SupabaseClient] ✅ Initialized successfully');
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
     * @returns {string} subscriptionId
     */
    async subscribe(table, callback, options = {}) {
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
                    console.log(`[SupabaseClient] 📡 ${table} ${event}:`, payload.new || payload.old);
                    callback(event.toLowerCase(), payload.new || payload.old);
                }
            );
        });

        const subscription = await channel.subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[SupabaseClient] ✅ Subscribed to ${table}`);
            } else if (status === 'CHANNEL_ERROR') {
                console.error(`[SupabaseClient] ❌ Channel error for ${table}:`, err);
            } else if (status === 'TIMED_OUT') {
                console.warn(`[SupabaseClient] ⚠️ Subscription timed out for ${table}`);
            } else {
                console.log(`[SupabaseClient] Subscription status for ${table}:`, status);
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
            console.log(`[SupabaseClient] ❌ Unsubscribed from ${subscription.table}`);
        }
    }

    /**
     * Unsubscribe from all channels
     */
    async unsubscribeAll() {
        const promises = Array.from(this.subscriptions.keys()).map(id => this.unsubscribe(id));
        await Promise.all(promises);
        this.subscriptions.clear();
        console.log('[SupabaseClient] ❌ Unsubscribed from all channels');
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
