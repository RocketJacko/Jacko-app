export default function Example() {
  return (
    <>
      {" "}
      <style>{` @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900&display=swap'); * { font-family: 'Poppins', sans-serif; } .hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } `}</style>{" "}
      <section>
        {" "}
        <div>
          {" "}
          <h1>Our Latest Creations</h1>{" "}
          <p>
            {" "}
            A visual collection of our most recent works – each piece crafted
            with intention, emotion, and style.{" "}
          </p>{" "}
        </div>{" "}
        {/* Carrusel móvil y Acordeón Desktop */}{" "}
        <div>
          {" "}
          {[
            "/assets/pricing-free-new.jpg",
            "/assets/pricing-20-usd.jpeg",
            "/assets/pricing-8-usd.jpeg",
          ].map((src, idx) => (
            <div key={idx} /* Desktop: Acordeón */>
              {" "}
              {/* Imagen para Móvil (Se ve completa sin recortes) */}{" "}
              <img src={src} alt={`Plan Móvil ${idx}`} />{" "}
              {/* Imagen para Desktop (Efecto Acordeón original) */}{" "}
              <img src={src} alt={`Plan Desktop ${idx}`} />{" "}
            </div>
          ))}{" "}
        </div>{" "}
      </section>{" "}
    </>
  );
}
