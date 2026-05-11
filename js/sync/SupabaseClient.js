/**
 * SupabaseClient - Frontend Supabase integration
 * Handles direct Supabase operations and realtime subscriptions
 */

class SupabaseClient {
    constructor() {
        this.client = null;
        this.subscriptions = new Map();
        this.initialized = false;
    }

    /**
     * Initialize Supabase client
     * @param {string} url - Supabase project URL
     * @param {string} key - Supabase anon key
     */
    async init(url, key) {
        if (this.initialized) {
            console.log('[SupabaseClient] Already initialized');
            return;
        }

        try {
            // Dynamically import Supabase JS client
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
            
            this.client = createClient(url, key, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            });

            this.initialized = true;
            console.log('[SupabaseClient] ✅ Initialized');
        } catch (error) {
            console.error('[SupabaseClient] ❌ Failed to initialize:', error);
            throw error;
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
        const results = [];
        
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

        const subscription = await channel.subscribe((status) => {
            console.log(`[SupabaseClient] Subscription status for ${table}:`, status);
        });

        this.subscriptions.set(channelName, { channel, table, callback });
        console.log(`[SupabaseClient] ✅ Subscribed to ${table}`);

        return channelName;
    }

    /**
     * Unsubscribe from a channel
     * @param {string} subscriptionId - Channel name
     */
    async unsubscribe(subscriptionId) {
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
        let query = this.client.from(table).select('*');

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
        const { error } = await this.client.auth.signOut();
        if (error) throw error;
    }

    /**
     * Get current user
     * @returns {Object|null}
     */
    getCurrentUser() {
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
