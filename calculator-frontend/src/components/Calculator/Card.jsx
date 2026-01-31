
const Card = ({ title, value }) => (
  <div className="bg-white shadow rounded-xl p-6 text-center">
    <div className="text-xl font-semibold">{value}</div>
    <div className="text-gray-500 mt-1">{title}</div>
  </div>
);

export default Card;
