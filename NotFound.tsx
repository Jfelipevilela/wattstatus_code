import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-gray-100 flex flex-col justify-center items-center text-center px-6">
      
      <h1 className="text-[120px] font-bold text-blue-800">
        404
      </h1>

      <h2 className="text-2xl mt-2 text-gray-800">
        Oops! Página não encontrada
      </h2>

      <p className="max-w-md mt-3 text-gray-500 leading-relaxed">
        A página que você está procurando pode ter sido removida,
        renomeada ou está temporariamente indisponível.
      </p>

      <button
        onClick={() => navigate("/")}
        className="
          mt-6
          flex
          items-center
          gap-2
          px-6
          py-3
          bg-blue-800
          hover:bg-energy-blue-light
          text-white
          rounded-lg
          transition-colors
          duration-300
        "
      >
        <ArrowLeft size={18} />
        Voltar para a página inicial
      </button>

    </div>
  );
};