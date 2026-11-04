// --- STATE MANAGEMENT ---
module.exports = {
    client: null,
    config: {},
    activeToken: '',
    responseTimeout: null,
    emergencyRecoveryActive: false,
    emergencyRecoveryTimer: null,
    emergencyRecoveryListener: null,
    emergencyRecoveryClient: null,
    emergencyRecoveryPending: null,
    isStartupReadyRoutine: false,
    startupReadyRoutineUntil: 0,
    stats: {
        accounts: {}
    },
    loops: {}
};
