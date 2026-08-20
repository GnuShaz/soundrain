import { MigrationInterface, QueryRunner } from "typeorm";

export class PlaybackStateCascade1787050604409 implements MigrationInterface {
    name = 'PlaybackStateCascade1787050604409'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "playback_state" DROP CONSTRAINT "FK_9e3fab049dbbf2fe62c3e561205"`);
        await queryRunner.query(`ALTER TABLE "playback_state" ADD CONSTRAINT "FK_9e3fab049dbbf2fe62c3e561205" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "playback_state" DROP CONSTRAINT "FK_9e3fab049dbbf2fe62c3e561205"`);
        await queryRunner.query(`ALTER TABLE "playback_state" ADD CONSTRAINT "FK_9e3fab049dbbf2fe62c3e561205" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
