import { HomeBenefits } from "@/components/sections/HomeBenefits";
import { HomeCategories } from "@/components/sections/HomeCategories";
import { HomeHero } from "@/components/sections/HomeHero";
import { HomeSelection } from "@/components/sections/HomeSelection";

export default function HomePage() {
  return (
    <main className="home-page" id="main-content">
      <HomeHero />
      <HomeBenefits />
      <HomeCategories />
      <HomeSelection />
    </main>
  );
}
