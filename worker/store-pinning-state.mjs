// Explicit rollout switch: legacy deployments/clients keep their existing order.
export const storePinningEnabled=env=>env?.STORE_DIRECTORY_PINNING_ENABLED===true||env?.STORE_DIRECTORY_PINNING_ENABLED==='true';
