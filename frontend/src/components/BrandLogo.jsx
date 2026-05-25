import logoSrc from "../assets/brandcastlogo.png";

// Logo da Agência Brandcast. PNG com fundo transparente — usa direto sem wrapper.
export default function BrandLogo({ height = 40, className }) {
  return (
    <img
      src={logoSrc}
      alt="Agência Brandcast"
      className={className}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
