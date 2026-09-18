-- CreateTable
CREATE TABLE "user_theme_preferences" (
    "user_id" TEXT NOT NULL,
    "background" VARCHAR(40) NOT NULL,
    "accent" VARCHAR(7) NOT NULL,
    "surface_opacity" DOUBLE PRECISION NOT NULL,
    "surface_blur" SMALLINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_theme_preferences_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "user_theme_preferences" ADD CONSTRAINT "user_theme_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
