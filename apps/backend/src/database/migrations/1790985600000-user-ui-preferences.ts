import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserUiPreferences1790985600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users
        ADD COLUMN ui_theme varchar(5) NOT NULL DEFAULT 'LIGHT',
        ADD COLUMN ui_background_color varchar(7);
      ALTER TABLE users
        ADD CONSTRAINT users_ui_theme_check CHECK (ui_theme IN ('LIGHT', 'DARK')),
        ADD CONSTRAINT users_ui_background_color_check
          CHECK (ui_background_color IS NULL OR ui_background_color ~ '^#[0-9A-Fa-f]{6}$');
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users
        DROP CONSTRAINT users_ui_background_color_check,
        DROP CONSTRAINT users_ui_theme_check,
        DROP COLUMN ui_background_color,
        DROP COLUMN ui_theme;
    `);
  }
}
