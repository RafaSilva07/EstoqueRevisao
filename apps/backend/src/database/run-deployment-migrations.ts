import { DataSource, MigrationExecutor } from 'typeorm';

export async function runDeploymentMigrations(dataSource: DataSource): Promise<string[]> {
  const runner = dataSource.createQueryRunner();
  try {
    await runner.startTransaction();
    // Serializa a atualização do esquema quando duas instâncias iniciam juntas.
    await runner.query('SELECT pg_advisory_xact_lock($1, $2)', [17915904, 1]);
    const migrations = await new MigrationExecutor(dataSource, runner).executePendingMigrations();
    await runner.commitTransaction();
    return migrations.map((migration) => migration.name);
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
