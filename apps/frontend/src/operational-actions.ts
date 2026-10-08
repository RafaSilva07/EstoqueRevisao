import { createContext, useContext } from 'react';

export const OperationalActionsContext = createContext<{
  review?: (prefill: { productId: string; batchId: string }) => void;
  adminRoles: string[];
  changed?: () => void;
}>({ adminRoles: [] });
export const useOperationalActions = () => useContext(OperationalActionsContext);
