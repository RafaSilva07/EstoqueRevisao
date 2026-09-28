export const areaAdministratorModes = {
  ADMIN_REVISAO_EXPEDICAO: ['REVISAO', 'EXPEDICAO'],
  ADMIN_PRODUCAO_PCP: ['PRODUCAO', 'PCP'],
} as const;

export const allOperationalModes = ['ADMIN', 'REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'] as const;

export function allowedOperationalModes(roles: string[]): readonly string[] {
  if (roles.includes('ADMIN')) return allOperationalModes;
  if (roles.includes('ADMIN_REVISAO_EXPEDICAO')) return areaAdministratorModes.ADMIN_REVISAO_EXPEDICAO;
  if (roles.includes('ADMIN_PRODUCAO_PCP')) return areaAdministratorModes.ADMIN_PRODUCAO_PCP;
  return [];
}
