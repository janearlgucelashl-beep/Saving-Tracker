const STORAGE_KEY = 'savings_tracker_data';

export const Store = {
    save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    load() {
        const data = localStorage.getItem(STORAGE_KEY);
        const defaultState = {
            tosAgreed: false,
            plans: [],
            totalSavings: 0,
            totalSpent: 0,
            lastLoginDate: new Date().toDateString()
        };

        if (!data) return defaultState;
        
        const parsed = JSON.parse(data);
        return { ...defaultState, ...parsed };
    }
};