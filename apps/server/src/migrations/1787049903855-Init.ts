import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1787049903855 implements MigrationInterface {
    name = 'Init1787049903855'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tracks" ("scTrackId" bigint NOT NULL, "title" character varying NOT NULL, "artistUsername" character varying NOT NULL, "artworkUrl" text, "durationMs" integer NOT NULL, "permalinkUrl" text NOT NULL, "streamable" boolean NOT NULL DEFAULT true, "cachedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_00e23d582c5628d29f02c8e4f12" PRIMARY KEY ("scTrackId"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scUserId" bigint NOT NULL, "username" character varying NOT NULL, "avatarUrl" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_9f31e0a3bd4673533a2ae4ce98a" UNIQUE ("scUserId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "likes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "scTrackId" bigint NOT NULL, "likedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "syncState" character varying(20) NOT NULL DEFAULT 'synced', CONSTRAINT "UQ_b26112e331fb5ca4b1ddc4b67f4" UNIQUE ("userId", "scTrackId"), CONSTRAINT "PK_a9323de3f8bced7539a794b4a37" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "playback_state" ("userId" uuid NOT NULL, "currentTrackId" bigint, "positionSecs" double precision NOT NULL DEFAULT '0', "volume" double precision NOT NULL DEFAULT '1', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9e3fab049dbbf2fe62c3e561205" PRIMARY KEY ("userId"))`);
        await queryRunner.query(`CREATE TABLE "queue_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "scTrackId" bigint NOT NULL, "position" integer NOT NULL, "addedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ab07257a98debdc3613e913054a" UNIQUE ("userId", "position"), CONSTRAINT "PK_2245e11ac3517494bacfe932773" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "likes" ADD CONSTRAINT "FK_cfd8e81fac09d7339a32e57d904" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "likes" ADD CONSTRAINT "FK_15dc668790801bd4072540e373e" FOREIGN KEY ("scTrackId") REFERENCES "tracks"("scTrackId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "playback_state" ADD CONSTRAINT "FK_9e3fab049dbbf2fe62c3e561205" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "playback_state" ADD CONSTRAINT "FK_13e2c02b54af3363ecb8994916b" FOREIGN KEY ("currentTrackId") REFERENCES "tracks"("scTrackId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "queue_items" ADD CONSTRAINT "FK_d37e4509c40b852790a7f4cdbf0" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "queue_items" ADD CONSTRAINT "FK_9d6135531c3c4ca3a4f9da70887" FOREIGN KEY ("scTrackId") REFERENCES "tracks"("scTrackId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "queue_items" DROP CONSTRAINT "FK_9d6135531c3c4ca3a4f9da70887"`);
        await queryRunner.query(`ALTER TABLE "queue_items" DROP CONSTRAINT "FK_d37e4509c40b852790a7f4cdbf0"`);
        await queryRunner.query(`ALTER TABLE "playback_state" DROP CONSTRAINT "FK_13e2c02b54af3363ecb8994916b"`);
        await queryRunner.query(`ALTER TABLE "playback_state" DROP CONSTRAINT "FK_9e3fab049dbbf2fe62c3e561205"`);
        await queryRunner.query(`ALTER TABLE "likes" DROP CONSTRAINT "FK_15dc668790801bd4072540e373e"`);
        await queryRunner.query(`ALTER TABLE "likes" DROP CONSTRAINT "FK_cfd8e81fac09d7339a32e57d904"`);
        await queryRunner.query(`DROP TABLE "queue_items"`);
        await queryRunner.query(`DROP TABLE "playback_state"`);
        await queryRunner.query(`DROP TABLE "likes"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "tracks"`);
    }

}
